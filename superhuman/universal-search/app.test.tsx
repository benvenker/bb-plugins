// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { asPluginApp } from "../testing";
import { searchCache } from "./host";
import { installThreadSearch } from "./threads";
import { installPaletteSearch } from "./palette";

vi.mock("./host", () => ({ searchCache: vi.fn() }));
vi.mock("./threads", () => ({ installThreadSearch: vi.fn() }));
vi.mock("./palette", () => ({ installPaletteSearch: vi.fn() }));
const invalidate = vi.fn(), stopThreads = vi.fn(), stopPalette = vi.fn();

beforeEach(() => {
  vi.mocked(searchCache).mockReturnValue(invalidate);
  vi.mocked(installThreadSearch).mockReturnValue(stopThreads);
  vi.mocked(installPaletteSearch).mockReturnValue(stopPalette);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
async function mount(enabled = true) {
  const app = await loadPluginApp(asPluginApp(() => import("./app")));
  return renderSlot(app.appOverlays[0]!, {}, {
    settings: { universalSearch: enabled },
  });
}

it("installs, clears cached searches and cleans up", async () => {
  const slot = await mount();
  await vi.waitFor(() => expect(installThreadSearch).toHaveBeenCalledOnce());
  expect(installPaletteSearch).toHaveBeenCalledOnce();
  expect(invalidate).toHaveBeenCalledTimes(1);
  slot.lifecycle.unmount();
  expect(stopThreads).toHaveBeenCalledOnce();
  expect(stopPalette).toHaveBeenCalledOnce();
  expect(invalidate).toHaveBeenCalledTimes(2);
});

it("does not touch native search when switched off", async () => {
  await mount(false);
  expect(searchCache).not.toHaveBeenCalled();
  expect(installThreadSearch).not.toHaveBeenCalled();
});

it.each([
  ["can't find BB's search cache", () => null],
  ["fails to read BB", () => { throw Error("host changed"); }],
])("leaves BB's search alone when it %s", async (_, cache) => {
  vi.mocked(searchCache).mockImplementation(cache);
  await mount();
  await vi.waitFor(() => expect(searchCache).toHaveBeenCalled());
  expect(installThreadSearch).not.toHaveBeenCalled();
  expect(installPaletteSearch).not.toHaveBeenCalled();
});

it("rolls back a partially installed adapter", async () => {
  vi.mocked(installPaletteSearch).mockImplementationOnce(() => { throw Error("host changed"); });
  await mount();
  await vi.waitFor(() => expect(stopThreads).toHaveBeenCalledOnce());
  expect(invalidate).toHaveBeenCalledOnce();
});
