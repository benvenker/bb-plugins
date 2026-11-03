import { beforeEach, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";

const take = vi.hoisted(() => ({
  add: vi.fn(),
  size: vi.fn(),
  end: vi.fn(),
  abandon: vi.fn(),
}));
const engine = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  stream: vi.fn(() => take as typeof take | null),
  status: vi.fn(() => ({ ready: false, message: "Building the recognizer" })),
  transcribe: vi.fn(async () => "Эм, привет, BB."),
  close: vi.fn(),
}));
vi.mock("./engine", () => ({ createEngine: () => engine }));

import plugin from "./server";

beforeEach(() => vi.clearAllMocks());

it("offers Parakeet Ultra for voice input, without hesitations", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "voice-input" });
  plugin(bb);
  expect(engine.start).toHaveBeenCalledOnce();

  const [service] = harness.inspection.registrations.aiServiceRegistrations;
  expect(service.id).toBe("parakeet");
  expect(await service.status!()).toEqual({
    ready: false,
    message: "Building the recognizer",
  });

  const audio = new File([new Uint8Array(8)], "take.webm");
  const signal = new AbortController().signal;
  expect(await service.transcribe!(audio, { signal, hint: null })).toBe(
    "Привет, BB.",
  );
  expect(engine.transcribe).toHaveBeenCalledWith(audio, signal);
});

it("defines a Microphone setting, Automatic by default", () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "voice-input" });
  plugin(bb);
  const { microphone } = harness.inspection.registrations.settingsDescriptors;
  expect(microphone).toMatchObject({
    type: "select",
    options: ["automatic", "built-in"],
    default: "automatic",
  });
});

it("streams a take from the browser to the engine", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "voice-input" });
  plugin(bb);
  const socket = await harness.experimental_openWebSocket("/stream");
  const samples = new Uint8Array([1, 0, 2, 0]);
  await socket.receive(samples);
  await socket.receive("size:123");
  await socket.receive("end");
  expect(take.add).toHaveBeenCalledWith(samples);
  expect(take.size).toHaveBeenCalledWith(123);
  expect(take.end).toHaveBeenCalledOnce();
  await socket.close();
  expect(take.abandon).toHaveBeenCalledOnce();
});

it("turns a stream away until the recognizer is up", async () => {
  engine.stream.mockReturnValueOnce(null);
  const { bb, harness } = createFakePluginHost({ pluginId: "voice-input" });
  plugin(bb);
  const socket = await harness.experimental_openWebSocket("/stream");
  expect(socket.closeCalls).toEqual([{ code: 1013, reason: "Not ready" }]);
});

it("stops a stream while voice input uses another service", async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: "voice-input" });
  harness.sdk.stub("system.aiServices", async () => ({
    selections: { voice: { mode: "automatic" } },
  }));
  plugin(bb);
  const socket = await harness.experimental_openWebSocket("/stream");
  await vi.waitFor(() =>
    expect(socket.closeCalls).toEqual([
      { code: 1000, reason: "Voice input uses another service" },
    ]),
  );
  expect(take.abandon).toHaveBeenCalled();
});
