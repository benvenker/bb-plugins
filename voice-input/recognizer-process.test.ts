import { afterEach, expect, it } from "vitest";
import { RecognizerProcess } from "./recognizer-process";

/**
 * A recognizer that answers with the file name, late for "slow", and with a
 * streamed take's size.
 */
const FAKE = `
const { createInterface } = require("node:readline");
const lines = createInterface({ input: process.stdin });
if (process.argv[1] === "broken") {
  console.log(JSON.stringify({ error: "No graphs" }));
  process.exit(1);
}
console.log(JSON.stringify({ ready: true }));
const takes = {};
lines.on("line", (line) => {
  const { id, audio, take, samples, finish, drop } = JSON.parse(line);
  if (take !== undefined) {
    takes[take] = (takes[take] ?? 0) + Buffer.from(samples ?? "", "base64").length;
    if (drop) delete takes[take];
    if (finish) console.log(JSON.stringify({ id, text: take + ": " + (takes[take] ?? 0) + " bytes" }));
    return;
  }
  if (audio === "crash") process.exit(3);
  const reply = audio === "bad"
    ? { id, error: "Cannot read bad" }
    : { id, text: "text of " + audio };
  const delay = audio === "slow" ? 50 : 0;
  setTimeout(() => console.log(JSON.stringify(reply)), delay);
});
`;

let recognizer: RecognizerProcess;
const signal = new AbortController().signal;
afterEach(() => recognizer?.close());

it("answers takes in order and reports a take it cannot read", async () => {
  recognizer = new RecognizerProcess(process.execPath, ["-e", FAKE]);
  await recognizer.ready;
  const slow = recognizer.transcribe("slow", signal);
  const fast = recognizer.transcribe("fast", signal);
  await expect(slow).resolves.toBe("text of slow");
  await expect(fast).resolves.toBe("text of fast");
  await expect(recognizer.transcribe("bad", signal)).rejects.toThrow(
    "Cannot read bad",
  );
});

it("fails the takes under way and later when the recognizer dies", async () => {
  recognizer = new RecognizerProcess(process.execPath, ["-e", FAKE]);
  await recognizer.ready;
  await expect(recognizer.transcribe("crash", signal)).rejects.toThrow(
    "exited with 3",
  );
  expect((await recognizer.exited).message).toContain("exited with 3");
  await expect(recognizer.transcribe("late", signal)).rejects.toThrow(
    "exited with 3",
  );
});

it("stops a take that BB stopped waiting for", async () => {
  recognizer = new RecognizerProcess(process.execPath, ["-e", FAKE]);
  await recognizer.ready;
  const abort = new AbortController();
  const take = recognizer.transcribe("slow", abort.signal);
  abort.abort();
  await expect(take).rejects.toThrow("exited with SIGTERM");
});

it("fails to start with the recognizer's own reason", async () => {
  recognizer = new RecognizerProcess(process.execPath, ["-e", FAKE, "broken"]);
  await expect(recognizer.ready).rejects.toThrow("No graphs");
});

it("finishes a streamed take with the samples it was sent", async () => {
  recognizer = new RecognizerProcess(process.execPath, ["-e", FAKE]);
  await recognizer.ready;
  recognizer.append("a", new Uint8Array(4));
  recognizer.append("a", new Uint8Array(6));
  recognizer.append("b", new Uint8Array(2));
  recognizer.drop("b");
  await expect(recognizer.finish("a")).resolves.toBe("a: 10 bytes");
  await expect(recognizer.finish("b")).resolves.toBe("b: 0 bytes");
});
