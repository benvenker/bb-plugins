// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { toast } from "sonner";
import { asPluginApp } from "../testing";
import { searchCache } from "../universal-search/host";
import { installSearchActions } from "./rows";

vi.mock("sonner", () => ({
  toast: { custom: vi.fn(), dismiss: vi.fn() },
}));
vi.mock("../universal-search/host", () => ({ searchCache: vi.fn() }));
vi.mock("./rows", () => ({ installSearchActions: vi.fn() }));
const invalidate = vi.fn();
const fail = () => Promise.reject(new Error("offline"));
const FILTER = "bb.palette.threadArchiveFilter";
// Node's own localStorage, which needs a backing file, hides jsdom's; the
// tests get an in-memory one.
const storage = new Map<string, string>();
const memory = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
};
vi.stubGlobal("localStorage", memory);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  storage.clear();
  vi.stubGlobal("localStorage", memory);
});

async function mount(failing = false) {
  vi.mocked(searchCache).mockReturnValue(invalidate);
  vi.mocked(installSearchActions).mockReturnValue(() => {});
  const app = await loadPluginApp(asPluginApp(() => import("./app")));
  const slot = renderSlot(app.appOverlays[0]!, {}, {
    sdk: {
      threads: {
        unarchive: failing ? fail : async () => ({ ok: true as const }),
      },
    },
    rpc: { unsnooze: failing ? fail : () => null },
  });
  await vi.waitFor(() => expect(installSearchActions).toHaveBeenCalledOnce());
  const [doc, actionFor] = vi.mocked(installSearchActions).mock.calls[0]!;
  expect(doc).toBe(document);
  invalidate.mockClear();
  const action = (archivedAt: unknown, visibility: unknown) =>
    actionFor({ id: "t1", archivedAt, visibility });
  return { slot, action };
}

it("unarchives an archived thread and refetches the search", async () => {
  const { slot, action } = await mount();
  expect(action(1, "hidden")?.label).toBe("Unarchive");
  const unarchive = action(1, "visible")!;
  expect(unarchive.label).toBe("Unarchive");
  unarchive.run();
  await vi.waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
  expect(slot.inspection.sdkCalls.at(-1)).toEqual({
    method: "threads.unarchive",
    args: [{ threadId: "t1" }],
  });
});

it("unsnoozes a hidden thread, and leaves others to BB", async () => {
  const { slot, action } = await mount();
  const unsnooze = action(null, "hidden")!;
  expect(unsnooze.label).toBe("Unsnooze");
  unsnooze.run();
  await vi.waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
  expect(slot.inspection.rpcCalls).toContainEqual({
    method: "unsnooze",
    input: { threadId: "t1" },
  });
  expect(action(null, "visible")).toBeNull();
  expect(action(undefined, "visible")).toBeNull();
});

it.each([
  ["Could not unarchive the thread", 1],
  ["Could not unsnooze the thread", null],
])("shows %s when the action fails", async (title, archivedAt) => {
  const { action } = await mount(true);
  action(archivedAt, "hidden")!.run();
  await vi.waitFor(() => expect(toast.custom).toHaveBeenCalledOnce());
  const [card] = vi.mocked(toast.custom).mock.calls[0]!;
  render(card("toast-1"));
  expect(screen.getByText(title)).toBeTruthy();
  expect(screen.getByText(/offline/)).toBeTruthy();
  expect(invalidate).not.toHaveBeenCalled();
});

it("lists archived threads in a browser that never changed the Filter", async () => {
  await mount();
  expect(JSON.parse(localStorage.getItem(FILTER)!)).toEqual(["active", "archived"]);
});

it("keeps the Filter someone picked", async () => {
  localStorage.setItem(FILTER, JSON.stringify(["active"]));
  await mount();
  expect(localStorage.getItem(FILTER)).toBe(JSON.stringify(["active"]));
});

it("installs where storage is blocked", async () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); } });
  await mount();
});

it("installs nothing when switched off", async () => {
  const app = await loadPluginApp(asPluginApp(() => import("./app")));
  renderSlot(app.appOverlays[0]!, {}, {
    settings: { searchActions: false },
  });
  expect(searchCache).not.toHaveBeenCalled();
  expect(installSearchActions).not.toHaveBeenCalled();
  expect(localStorage.getItem(FILTER)).toBeNull();
});
