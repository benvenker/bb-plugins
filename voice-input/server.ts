import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createEngine, type Stream } from "./engine";
import { stripHesitations } from "./hesitations";

const SERVICE = "parakeet";

export default function plugin(bb: BbPluginApi): void {
  // BB records in the browser, so app.tsx reads this setting.
  bb.settings.define({
    microphone: {
      type: "select",
      label: "Microphone",
      description:
        "Automatic uses the microphone BB picks on each device. Built-in records with the Mac's, iPhone's, or iPad's own microphone, even with AirPods on. A microphone you picked in Settings → General → Voice Input wins.",
      options: ["automatic", "built-in"],
      experimental_optionLabels: {
        automatic: "Automatic",
        "built-in": "Built-in",
      },
      default: "automatic",
    },
  });

  const engine = createEngine((message) => bb.log.info(message));
  bb.onDispose(() => engine.close());

  bb.experimental_aiServices.register({
    id: SERVICE,
    displayName: "Parakeet Ultra",
    transcribe: async (audio, { signal }) =>
      stripHesitations(await engine.transcribe(audio, signal)),
    status: async () => engine.status(),
  });

  /** Whether BB sends voice input to this plugin; a check that fails says yes. */
  const chosen = async () => {
    try {
      const { voice } = (await bb.sdk.system.aiServices()).selections;
      return (
        voice.mode === "service" &&
        voice.pluginId === bb.pluginId &&
        voice.serviceId === SERVICE
      );
    } catch {
      return true;
    }
  };

  // The browser streams each take while it is spoken (stream.ts): binary
  // messages of 16 kHz 16-bit samples, "size:<bytes>" for BB's recording of
  // it, then "end" when the take stops.
  bb.http.experimental_websocket("/stream", () => {
    let take: Stream | null = null;
    return {
      onOpen(socket) {
        take = engine.stream();
        if (!take) return socket.close(1013, "Not ready");
        void chosen().then((yes) => {
          if (yes) return;
          take?.abandon();
          socket.close(1000, "Voice input uses another service");
        });
      },
      onMessage(_socket, data) {
        if (typeof data !== "string") take?.add(data);
        else if (data === "end") take?.end();
        else if (data.startsWith("size:")) take?.size(Number(data.slice(5)));
      },
      onClose: () => take?.abandon(),
      onError: () => take?.abandon(),
    };
  });

  // The model downloads and opens now, so the first take does not wait.
  engine.start().catch((error: Error) => bb.log.warn(error.message));
}
