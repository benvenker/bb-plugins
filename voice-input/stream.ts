// Streams BB's voice recordings to the plugin's server while they are spoken,
// so the server has decoded most of a take by the time it stops, and has BB
// put the text in as soon as it comes.

const RATE = 16_000;
/** 80 ms, one frame of Parakeet's encoder. */
const CHUNK = 1_280;
/** How long the worklet may take to hand over its last samples. */
const FLUSH_MS = 500;
/**
 * Under this query BB's composer puts a transcript in at once. Otherwise it
 * first plays a 180 ms transition, after the text has come.
 */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** How long after BB stops recording a streamed take it sees reduced motion. */
const HURRY_MS = 2_000;
let hurryUntil = 0;

/**
 * Turns the microphone into 16-bit samples at 16 kHz and posts them in chunks
 * of 80 ms. A context that runs at another rate averages the samples of each
 * 16 kHz step. "flush" posts what is left, then "flushed".
 */
const TAP = `registerProcessor("voice-input-tap", class extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Int16Array(${CHUNK});
    this.length = 0;
    this.step = sampleRate / ${RATE};
    this.position = 0;
    this.sum = 0;
    this.count = 0;
    this.port.onmessage = () => {
      this.post();
      this.port.postMessage("flushed");
    };
  }
  post() {
    if (this.length === 0) return;
    const samples = this.chunk.slice(0, this.length);
    this.port.postMessage(samples.buffer, [samples.buffer]);
    this.length = 0;
  }
  process([input]) {
    for (const value of input[0] ?? []) {
      this.sum += value;
      this.count += 1;
      this.position += 1;
      if (this.position < this.step) continue;
      this.position -= this.step;
      const sample = Math.max(-1, Math.min(1, this.sum / this.count));
      this.chunk[this.length++] = Math.round(sample * 32767);
      this.sum = 0;
      this.count = 0;
      if (this.length === ${CHUNK}) this.post();
    }
    return true;
  }
});`;

type Take = {
  context: AudioContext;
  /** Where each microphone of the take plays in. */
  input: GainNode;
  /** The microphone tracks still recording. */
  live: Set<MediaStreamTrack>;
  /** Tells the server the size of BB's recording of the take. */
  size(bytes: number): void;
  /** Whether the server still takes the stream. */
  streaming(): boolean;
  /** Ends the take once its last samples are out. */
  end(): void;
  /** Drops the take: the server decodes BB's recording instead. */
  abandon(): void;
};

/**
 * The take being recorded. A microphone opened during it, as when BB switches
 * microphones, joins it.
 */
let current: Take | null = null;

/** A context that hears `microphone`: at 16 kHz where the browser allows it. */
function listen(microphone: MediaStream) {
  for (const options of [{ sampleRate: RATE }, {}]) {
    let context: AudioContext | undefined;
    try {
      context = new AudioContext(options);
      if (!context.audioWorklet) throw new Error("No audio worklets");
      return { context, source: context.createMediaStreamSource(microphone) };
    } catch {
      void context?.close();
    }
  }
  return null;
}

/** A new take that streams to `url`. */
function startTake(context: AudioContext, url: string): Take {
  let ended = false;
  let worklet: AudioWorkletNode | null = null;
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  const waiting: (ArrayBuffer | string)[] = [];
  const send = (data: ArrayBuffer | string) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
    else if (socket.readyState === WebSocket.CONNECTING) waiting.push(data);
  };
  socket.onopen = () => {
    for (const data of waiting.splice(0)) socket.send(data);
    if (ended) socket.close();
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    send("end");
    if (socket.readyState === WebSocket.OPEN) socket.close();
    void context.close();
  };

  const input = context.createGain();
  const module = URL.createObjectURL(
    new Blob([TAP], { type: "application/javascript" }),
  );
  context.audioWorklet
    .addModule(module)
    .then(() => {
      if (ended) return;
      worklet = new AudioWorkletNode(context, "voice-input-tap");
      worklet.port.onmessage = ({ data }) =>
        data === "flushed" ? finish() : send(data);
      input.connect(worklet);
      // The graph runs only while something pulls it; this plays nowhere.
      worklet.connect(context.createMediaStreamDestination());
    })
    .catch(finish)
    .finally(() => URL.revokeObjectURL(module));
  void context.resume();

  return {
    context,
    input,
    live: new Set(),
    size: (bytes) => send(`size:${bytes}`),
    streaming: () => socket.readyState !== WebSocket.CLOSED,
    end() {
      if (!worklet) return finish();
      worklet.port.postMessage("flush");
      // A suspended context never answers.
      setTimeout(finish, FLUSH_MS);
    },
    abandon() {
      ended = true;
      socket.close();
      void context.close();
    },
  };
}

/** Streams the microphone in `stream` until BB stops its track. */
function tap(stream: MediaStream, url: string): void {
  const [track] = stream.getAudioTracks();
  if (!track) return;
  const microphone = new MediaStream([track]);
  let source: MediaStreamAudioSourceNode;
  if (!current) {
    const heard = listen(microphone);
    if (!heard) return;
    current = startTake(heard.context, url);
    source = heard.source;
  } else {
    try {
      source = current.context.createMediaStreamSource(microphone);
    } catch {
      // The take would miss the new microphone's words.
      current.abandon();
      current = null;
      return;
    }
  }
  const take = current;
  source.connect(take.input);
  take.live.add(track);
  const stopped = () => {
    if (!take.live.delete(track)) return;
    source.disconnect();
    if (take.live.size > 0) return;
    if (current === take) current = null;
    take.end();
  };
  const stop = track.stop.bind(track);
  track.stop = () => {
    stop();
    stopped();
  };
  track.addEventListener("ended", stopped, { once: true });
}

/**
 * Has each recorder BB makes during a take report its recording's size, and
 * the page see reduced motion right after a streamed recording stops.
 */
function measureRecorders(): () => void {
  const Recorder = window.MediaRecorder;
  if (!Recorder) return () => {};
  const Measured = class extends Recorder {
    constructor(stream: MediaStream, options?: MediaRecorderOptions) {
      super(stream, options);
      const take = current;
      if (!take) return;
      let bytes = 0;
      this.addEventListener("dataavailable", ({ data }) => (bytes += data.size));
      this.addEventListener("stop", () => {
        if (!take.streaming()) return;
        take.size(bytes);
        hurryUntil = Date.now() + HURRY_MS;
      });
    }
  };
  window.MediaRecorder = Measured;
  return () => {
    if (window.MediaRecorder === Measured) window.MediaRecorder = Recorder;
  };
}

/** Has the page see reduced motion for a while after each take. */
function hurryTranscripts(): () => void {
  const proto = globalThis.MediaQueryList?.prototype;
  const matches = proto && Object.getOwnPropertyDescriptor(proto, "matches");
  const get = matches?.get;
  if (!proto || !matches || !get) return () => {};
  function hurried(this: MediaQueryList) {
    const hurry = this.media === REDUCED_MOTION && Date.now() < hurryUntil;
    return hurry || get!.call(this);
  }
  Object.defineProperty(proto, "matches", { ...matches, get: hurried });
  return () => {
    if (Object.getOwnPropertyDescriptor(proto, "matches")?.get === hurried)
      Object.defineProperty(proto, "matches", matches);
  };
}

/**
 * Has every microphone that BB opens stream to `url` too, each recording BB
 * makes of it report its size, and BB put the text in without its
 * transition. Returns a function that undoes it. The stream BB gets is
 * untouched.
 */
export function streamTakes(media: MediaDevices, url: string): () => void {
  const unmeasure = measureRecorders();
  const unhurry = hurryTranscripts();
  const original = media.getUserMedia;
  media.getUserMedia = async (constraints) => {
    const stream = await original.call(media, constraints);
    if (constraints?.audio && !constraints.video) {
      try {
        tap(stream, url);
      } catch {
        // BB's recording does not depend on the stream.
      }
    }
    return stream;
  };
  return () => {
    // The browser's own method lives on the prototype, unless a script
    // replaced it before this one.
    delete (media as Partial<MediaDevices>).getUserMedia;
    if (media.getUserMedia !== original) media.getUserMedia = original;
    unhurry();
    unmeasure();
  };
}
