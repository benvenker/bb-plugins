// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

afterEach(cleanup);

it("streams the microphone, and prefers the built-in one only while the setting says so", async () => {
  const getUserMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: Object.create({ getUserMedia }),
  });
  const app = await loadPluginApp(() => import("./app"));
  const overlay = app.appOverlays[0]!;
  renderSlot(overlay, {}, { settings: { microphone: "automatic" } });
  const streaming = navigator.mediaDevices.getUserMedia;
  expect(streaming).not.toBe(getUserMedia);
  cleanup();
  expect(navigator.mediaDevices.getUserMedia).toBe(getUserMedia);
  renderSlot(overlay, {}, { settings: { microphone: "built-in" } });
  expect(navigator.mediaDevices.getUserMedia).not.toBe(getUserMedia);
  expect(navigator.mediaDevices.getUserMedia).not.toBe(streaming);
  cleanup();
  expect(navigator.mediaDevices.getUserMedia).toBe(getUserMedia);
});
