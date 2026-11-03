// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { streamTakes } from "./stream";

class Track {
  stopped = vi.fn();
  stop() {
    this.stopped();
  }
  addEventListener() {}
}

class Socket {
  static all: Socket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  readyState = Socket.CONNECTING;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  constructor(readonly url: string) {
    Socket.all.push(this);
  }
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }
}

/** A worklet that holds one chunk of samples until it is flushed. */
class Tap {
  port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: () => {
      this.port.onmessage?.({ data: new ArrayBuffer(4) });
      this.port.onmessage?.({ data: "flushed" });
    },
  };
  connect() {}
}

const node = () => ({ connect() {}, disconnect() {} });
class Context {
  audioWorklet = { addModule: async () => {} };
  createGain = node;
  createMediaStreamDestination = node;
  createMediaStreamSource() {
    return node();
  }
  resume = async () => {};
  close = async () => {};
}

class Recorder extends EventTarget {
  constructor(readonly stream: MediaStream) {
    super();
  }
  record(...sizes: number[]) {
    for (const size of sizes)
      this.dispatchEvent(Object.assign(new Event("dataavailable"), { data: { size } }));
    this.dispatchEvent(new Event("stop"));
  }
}

class Query {
  constructor(readonly media: string) {}
  get matches() {
    return false;
  }
}

let media: MediaDevices;
let undo = () => {};
beforeEach(() => {
  Socket.all = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("AudioWorkletNode", Tap);
  vi.stubGlobal(
    "MediaStream",
    class {
      constructor(private tracks: Track[]) {}
      getAudioTracks = () => this.tracks;
    },
  );
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("MediaQueryList", Query);
  URL.createObjectURL = () => "blob:tap";
  URL.revokeObjectURL = () => {};
  const getUserMedia = async () => new MediaStream([new Track() as never]);
  media = Object.create({ getUserMedia });
  undo = streamTakes(media, "ws://bb/stream");
});
afterEach(() => {
  undo();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const tracks = (stream: MediaStream) =>
  stream.getAudioTracks() as unknown as Track[];

it("streams a take until BB stops its microphone", async () => {
  const stream = await media.getUserMedia({ audio: true });
  const [socket] = Socket.all;
  expect(socket?.url).toBe("ws://bb/stream");
  socket!.open();
  await new Promise((resolve) => setTimeout(resolve));
  const [track] = tracks(stream);
  track!.stop();
  expect(track!.stopped).toHaveBeenCalledOnce();
  expect(socket!.sent).toEqual([new ArrayBuffer(4), "end"]);
  expect(socket!.readyState).toBe(3);
});

it("keeps one take while BB switches microphones", async () => {
  const first = await media.getUserMedia({ audio: true });
  const second = await media.getUserMedia({ audio: { deviceId: "usb" } });
  expect(Socket.all).toHaveLength(1);
  Socket.all[0]!.open();
  await new Promise((resolve) => setTimeout(resolve));
  tracks(first)[0]!.stop();
  expect(Socket.all[0]!.sent).toEqual([]);
  tracks(second)[0]!.stop();
  expect(Socket.all[0]!.sent).toEqual([new ArrayBuffer(4), "end"]);
});

it("sends the end of a take that stops before the server answers", async () => {
  const stream = await media.getUserMedia({ audio: true });
  await new Promise((resolve) => setTimeout(resolve));
  tracks(stream)[0]!.stop();
  const [socket] = Socket.all;
  socket!.open();
  expect(socket!.sent).toEqual([new ArrayBuffer(4), "end"]);
  expect(socket!.readyState).toBe(3);
});

it("drops a take whose new microphone it cannot hear", async () => {
  await media.getUserMedia({ audio: true });
  Socket.all[0]!.open();
  vi.spyOn(Context.prototype, "createMediaStreamSource").mockImplementation(
    () => {
      throw new Error("Other sample rate");
    },
  );
  await media.getUserMedia({ audio: { deviceId: "usb" } });
  expect(Socket.all[0]!.sent).toEqual([]);
  expect(Socket.all[0]!.readyState).toBe(3);
});

it("reports the size of BB's recording of the take", async () => {
  const stream = await media.getUserMedia({ audio: true });
  Socket.all[0]!.open();
  const recorder = new MediaRecorder(stream) as unknown as Recorder;
  recorder.record(100, 50);
  expect(Socket.all[0]!.sent).toEqual(["size:150"]);
  tracks(stream)[0]!.stop();
});

it("has BB see reduced motion right after a streamed recording", async () => {
  // Takes in earlier tests ended moments ago.
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 60_000 });
  const motion = new Query("(prefers-reduced-motion: reduce)");
  const dark = new Query("(prefers-color-scheme: dark)");
  expect(motion.matches).toBe(false);
  const stream = await media.getUserMedia({ audio: true });
  Socket.all[0]!.open();
  (new MediaRecorder(stream) as unknown as Recorder).record(10);
  expect(motion.matches).toBe(true);
  expect(dark.matches).toBe(false);
  undo();
  expect(motion.matches).toBe(false);
});

it("leaves video calls alone", async () => {
  await media.getUserMedia({ audio: true, video: true });
  expect(Socket.all).toHaveLength(0);
});
