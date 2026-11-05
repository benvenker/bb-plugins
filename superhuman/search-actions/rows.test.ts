// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installSearchActions, type SearchAction, type SearchThread } from "./rows";

let stop: () => void;
let root: HTMLElement, input: HTMLInputElement, list: HTMLElement, group: HTMLElement;
let initial: string;
let bb: ReturnType<typeof vi.fn<(event: Event) => void>>;
let run: ReturnType<typeof vi.fn<(label: string, id: string) => Promise<void>>>;
let actionFor: ReturnType<typeof vi.fn<(thread: SearchThread) => SearchAction | null>>;
const archived = (id: string) => ({ id, archivedAt: "2026-10-01T00:00:00Z", visibility: "visible" });
const active = (id: string) => ({ id, archivedAt: null, visibility: "visible" });
/** A result as BB renders it: the option, then its split button where BB can split. */
function row(index: number, thread: unknown, split = true) {
  const wrapper = document.createElement("div");
  wrapper.className = "flex min-w-0 items-center rounded-md";
  wrapper.innerHTML = `<div id="threads-${index}" role="option" aria-selected="false">Thread ${index}</div>`
    + (split ? `<button type="button" aria-label="Open in split" class="ml-4 invisible" aria-hidden="true"
      tabindex="-1"><span class="mr-1">Open in split</span><kbd aria-hidden="true">⌘ ↵</kbd></button>` : "");
  Object.assign(wrapper.firstElementChild!, {
    __reactProps$test: { children: { props: { row: { id: `row-${index}`, thread } } } },
  });
  return wrapper;
}
const option = (index: number) => list.querySelector<HTMLElement>(`#threads-${index}`)!;
const split = (index: number) => option(index).nextElementSibling as HTMLElement;
const thread = (index: number) => Reflect.get(option(index), "__reactProps$test").children.props.row.thread;
const hints = () => [...root.querySelectorAll<HTMLElement>('button:not([aria-label="Open in split"])')];
/** Selects a row the way BB's commit does. */
function select(index: number) {
  for (const item of list.querySelectorAll<HTMLElement>('[role="option"]')) {
    item.ariaSelected = String(item === option(index));
    item.nextElementSibling?.classList.toggle("invisible", item !== option(index));
  }
  input.setAttribute("aria-activedescendant", `threads-${index}`);
}
const settle = () => new Promise((resolve) => setTimeout(resolve));
const key = (init: KeyboardEventInit, target: Element = input) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }));

beforeEach(() => {
  document.body.innerHTML = `<div data-testid="command-palette" role="dialog">
    <input aria-label="Search threads" aria-controls="threads">
    <div role="listbox" id="threads"><div role="group"></div></div></div>`;
  root = document.querySelector("[data-testid]")!;
  input = root.querySelector("input")!;
  list = document.getElementById("threads")!;
  group = list.querySelector("[role=group]")!;
  group.append(row(0, active("a")), row(1, archived("b")), row(2, archived("c")));
  select(1);
  // BB's React handlers, which listen on its root.
  bb = vi.fn();
  root.addEventListener("keydown", bb);
  root.addEventListener("click", bb);
  run = vi.fn(async () => {});
  actionFor = vi.fn((thread) => {
    const label = thread.visibility === "hidden" ? "Unsnooze" : thread.archivedAt ? "Unarchive" : null;
    return label && { label, run: () => run(label, thread.id) };
  });
  initial = document.body.innerHTML;
  stop = installSearchActions(document, actionFor);
});
afterEach(() => {
  stop();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it.each([{ metaKey: true }, { ctrlKey: true }])("runs the selected row's action on %o, not BB's split", (init) => {
  expect(key(init)).toBe(false);
  expect(run).toHaveBeenCalledExactlyOnceWith("Unarchive", "b");
  expect(bb).not.toHaveBeenCalled();
});

it("swallows a held ⌘↵ without repeating the action", () => {
  expect(key({ metaKey: true, repeat: true })).toBe(false);
  expect(run).not.toHaveBeenCalled();
  expect(bb).not.toHaveBeenCalled();
});

it("leaves other keys, composition, and rows without an action to BB", () => {
  for (const init of [{}, { metaKey: true, shiftKey: true }, { ctrlKey: true, altKey: true },
    { metaKey: true, isComposing: true }, { metaKey: true, keyCode: 229 }]) key(init);
  key({ metaKey: true, key: "k" });
  select(0);
  key({ metaKey: true });
  // Asked again on each key: an unarchived thread opens in split again.
  select(1);
  thread(1).archivedAt = null;
  key({ metaKey: true });
  expect(run).not.toHaveBeenCalled();
  expect(bb).toHaveBeenCalledTimes(8);
  expect(bb.mock.calls.some(([event]) => event.defaultPrevented)).toBe(false);
});

it("swaps the selected row's split hint for the action's, which runs it on click", () => {
  expect(split(1).hidden).toBe(true);
  const [hint] = hints();
  expect(hint!.previousElementSibling).toBe(split(1));
  expect(hint!.ariaLabel).toBe("Unarchive");
  expect(hint!.textContent).toBe("Unarchive⌘ ↵");
  expect(hint!.className).toBe("ml-4");
  expect(hint!.hasAttribute("aria-hidden") || hint!.hasAttribute("tabindex")).toBe(false);
  hint!.click();
  expect(run).toHaveBeenCalledExactlyOnceWith("Unarchive", "b");
  expect(bb).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(input);
});

it("checks the hint again once the action's refetch has rendered", async () => {
  key({ metaKey: true });
  // BB re-renders the row from the refetched search with no DOM change.
  thread(1).archivedAt = null;
  await vi.waitFor(() => expect(hints()).toEqual([]));
  expect(split(1).hidden).toBe(false);
});

it("leaves BB's DOM alone once disposed, even as an action settles", async () => {
  key({ metaKey: true });
  stop();
  await new Promise(requestAnimationFrame);
  expect(document.body.innerHTML).toBe(initial);
});

it("gives a stale hint's click back to BB's button", () => {
  input.focus(); // Safari keeps focus in the input on clicks.
  thread(1).archivedAt = null;
  hints()[0]!.click();
  expect(run).not.toHaveBeenCalled();
  expect(hints()).toEqual([]);
  expect(split(1).hidden).toBe(false);
});

it("follows the selection, re-rendered rows, and changed actions, restoring BB's button", async () => {
  select(0);
  await settle();
  expect(hints()).toEqual([]);
  expect(split(1).hidden).toBe(false);
  select(2);
  await settle();
  expect(hints().map((hint) => hint.previousElementSibling)).toEqual([split(2)]);
  group.replaceChildren(row(0, { ...active("d"), visibility: "hidden" }), row(1, archived("e")));
  select(0);
  await settle();
  expect(hints().map((hint) => [hint.previousElementSibling, hint.ariaLabel])).toEqual([[split(0), "Unsnooze"]]);
  // Unsnoozed and re-rendered in place.
  thread(0).visibility = "visible";
  option(0).firstChild!.nodeValue = "Thread 0, just now";
  await settle();
  expect(hints()).toEqual([]);
  expect(split(0).hidden).toBe(false);
  // A narrower window: React removes the split button.
  select(1);
  await settle();
  split(1).remove();
  await settle();
  expect(hints()).toEqual([]);
});

it("leaves ⌘↵ to BB without a split button or its label, and on unknown rows", async () => {
  const more = row(5, archived("f")), bare = row(6, archived("g")), unlabeled = row(7, archived("h"));
  Reflect.set(more.firstElementChild!, "__reactProps$test", { children: ["Show more"] });
  Reflect.deleteProperty(bare.firstElementChild!, "__reactProps$test");
  unlabeled.querySelector("span")!.remove();
  group.append(row(3, archived("phone"), false), row(4, { id: 4, archivedAt: "x" }), more, bare, unlabeled);
  select(3);
  await settle();
  expect(hints()).toEqual([]);
  key({ metaKey: true });
  stop();
  select(7);
  stop = installSearchActions(document, actionFor);
  expect(hints()).toEqual([]);
  expect(split(7).hidden).toBe(false);
  key({ metaKey: true });
  for (const index of [4, 5, 6]) {
    select(index);
    await settle();
    expect(hints()).toEqual([]);
    expect(split(index).hidden).toBe(false);
    key({ metaKey: true });
  }
  expect(run).not.toHaveBeenCalled();
  expect(bb).toHaveBeenCalledTimes(5);
});

it("does nothing until a thread search input takes focus", async () => {
  stop();
  root.remove();
  actionFor.mockClear();
  stop = installSearchActions(document, actionFor);
  const query = vi.spyOn(document, "querySelector");
  const prompt = document.body.appendChild(document.createElement("textarea"));
  prompt.focus();
  key({ metaKey: true }, prompt);
  document.body.append(root);
  await settle();
  expect(query).not.toHaveBeenCalled();
  expect(actionFor).not.toHaveBeenCalled();
  expect(hints()).toEqual([]);
  input.focus();
  expect(hints()).toHaveLength(1);
});

it("restores BB's DOM and keys on dispose", async () => {
  expect(hints()).toHaveLength(1);
  stop();
  expect(document.body.innerHTML).toBe(initial);
  select(2);
  await settle();
  expect(hints()).toEqual([]);
  key({ metaKey: true });
  expect(run).not.toHaveBeenCalled();
  expect(bb).toHaveBeenCalledOnce();
});
