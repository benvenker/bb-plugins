// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installPaletteSearch } from "./palette";

let stop: () => void;
let input: HTMLInputElement, list: HTMLElement;
let choose: ReturnType<typeof vi.fn<(id: string) => void>>;
function nativeRow(id: string, title: string) {
  const row = document.createElement("div");
  row.setAttribute("role", "option");
  row.setAttribute("data-palette-action-kind", "terminal");
  row.ariaSelected = "false";
  row.id = `native-${id}`;
  row.textContent = title;
  const select = () => choose(id);
  row.addEventListener("click", select);
  Object.assign(row, { __reactFiber$test: {
    memoizedProps: { entry: { action: { id, title, group: "Threads" } }, onSelect: select },
    return: null,
  } });
  return row;
}
const settle = () => vi.advanceTimersByTimeAsync(40);
function type(query: string, native: HTMLElement[] = []) {
  input.value = query;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  list.replaceChildren(...native);
}
const options = () => [...list.querySelectorAll<HTMLElement>('[role="option"]')];
const key = (key: string, init: KeyboardEventInit = {}) =>
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
  Element.prototype.scrollIntoView ??= () => {};
  document.body.innerHTML = `<div data-testid="command-palette" role="dialog">
    <input aria-label="Search commands" aria-controls="commands" aria-activedescendant="native-snooze">
    <div role="listbox" id="commands"></div></div>`;
  input = document.querySelector("input")!;
  list = document.getElementById("commands")!;
  choose = vi.fn();
  list.append(nativeRow("snooze", "Snooze thread"), nativeRow("new", "New thread"), nativeRow("ru", "Привет"));
  stop = installPaletteSearch(document);
});
afterEach(() => {
  stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it.each([
  ["ытщщяу", "Snooze thread", "snooze"], ["ghbdtn", "Привет", "ru"],
])("finds %s without changing input or composition and activates its command", async (query, title, id) => {
  type(query);
  await settle();
  expect(input.value).toBe(query);
  expect(options().map((row) => row.textContent)).toEqual([title]);
  expect(input.getAttribute("aria-activedescendant")).toBe(options()[0]!.id);
  key("Enter", { isComposing: true });
  expect(choose).not.toHaveBeenCalled();
  key("Enter");
  expect(choose).toHaveBeenCalledWith(id);
});

it("preserves real matches, deduplicates and navigates the merged list", async () => {
  type("т", [nativeRow("ru", "Привет"), nativeRow("snooze", "Snooze thread")]);
  await settle();
  expect(options().map((row) => row.textContent)).toEqual(["Привет", "Snooze thread", "New thread"]);
  key("End");
  key("Enter");
  expect(choose).toHaveBeenLastCalledWith("new");
  key("ArrowDown");
  key("Enter");
  expect(choose).toHaveBeenLastCalledWith("ru");
  key("ArrowUp");
  expect(options().filter((row) => row.ariaSelected === "true")).toEqual([options().at(-1)]);
});

it.each([
  ["the way BB does", "bg-state-hover text-foreground", ["Snooze thread"]],
  ["another way", "bg-accent", []],
])("adds rows only while BB draws its selected row %s", async (_, className, titles) => {
  const selected = document.getElementById("native-snooze")!;
  selected.ariaSelected = "true";
  selected.className = className;
  type("ытщщяу");
  await settle();
  expect(options().map((row) => row.textContent)).toEqual(titles);
});

it("hides the native empty state only while there are alternate matches", async () => {
  type("ытщщяу");
  const empty = document.createElement("p");
  empty.textContent = "No matching commands";
  list.append(empty);
  await settle();
  expect(empty.hidden).toBe(true);
  stop();
  expect(empty.hidden).toBe(false);
  expect(options()).toHaveLength(0);
});

it("restores selection on close and recaptures commands when the drawer reopens", async () => {
  const original = nativeRow("ru", "Привет");
  original.ariaSelected = "true";
  original.className = "bg-state-hover text-foreground";
  type("т", [original]);
  await settle();
  key("End");
  expect(original.ariaSelected).toBe("false");
  const root = document.querySelector<HTMLElement>("[data-testid]")!;
  root.dataset.state = "closed";
  await settle();
  expect(original.ariaSelected).toBe("true");
  expect(original.className).toBe("bg-state-hover text-foreground");
  expect(options()).toEqual([original]);
  type("", [nativeRow("new", "New thread")]);
  root.dataset.state = "open";
  await settle();
  type("ытщщяу");
  await settle();
  expect(options()).toHaveLength(0);
  type("туц");
  await settle();
  key("Enter");
  expect(choose).toHaveBeenCalledWith("new");
});

it("leaves typing outside the palette alone", () => {
  const prompt = document.createElement("textarea");
  document.body.append(prompt);
  const search = vi.spyOn(document, "querySelectorAll");
  prompt.dispatchEvent(new Event("input", { bubbles: true }));
  expect(search).not.toHaveBeenCalled();
});
