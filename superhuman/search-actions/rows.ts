import { object } from "../universal-search/host";

const INPUT = '[data-testid="command-palette"] input[aria-label="Search threads"]';
const SPLIT = 'button[aria-label="Open in split"]';

/** The fields of a thread-search row's thread that actions read. */
export type SearchThread = { id: string; archivedAt: unknown; visibility: unknown };

/** What ⌘↵ does on a row, settling once BB has refetched, and its hint's label. */
export type SearchAction = { label: string; run: () => Promise<unknown> };

/** The thread BB renders a result option from, or null for "Show more" and unknown shapes. */
function threadOf(option: Element): SearchThread | null {
  // React refreshes the props key on every commit; the fiber key can still
  // hold the previous render, with the thread as it was before an action.
  const key = Object.getOwnPropertyNames(option).find((key) => key.startsWith("__reactProps$"));
  const props: unknown = key && Reflect.get(option, key);
  const content = object(props) ? props.children : null;
  const row = object(content) && object(content.props) ? content.props.row : null;
  const thread = object(row) ? row.thread : null;
  return object(thread) && typeof thread.id === "string"
    ? { id: thread.id, archivedAt: thread.archivedAt, visibility: thread.visibility }
    : null;
}

const selected = (input: Element) =>
  input.ownerDocument.getElementById(input.getAttribute("aria-activedescendant") || "");

/**
 * In BB's thread search, the selected row's "Open in split" hint shows the
 * label of `actionFor(thread)` when it returns an action, and ⌘↵ or Ctrl+↵
 * runs it. Returns a disposer that restores BB's DOM.
 */
export function installSearchActions(
  doc: Document,
  actionFor: (thread: SearchThread) => SearchAction | null,
): () => void {
  const lifetime = new AbortController();
  let input: HTMLElement | null = null, list: HTMLElement | null = null;
  let hint: HTMLElement | null = null, split: HTMLElement | null = null;

  function actionOf(option: Element | null) {
    const thread = option && threadOf(option);
    return thread ? actionFor(thread) : null;
  }
  function run(action: SearchAction) {
    // The refetched row can render with no DOM change for the observer to see.
    const resync = () => requestAnimationFrame(() => {
      if (!lifetime.signal.aborted) sync();
    });
    void action.run().then(resync, resync);
  }
  function clear() {
    hint?.remove();
    if (split) split.hidden = false;
    hint = split = null;
  }
  function sync() {
    const option = input && selected(input);
    const sibling = option?.nextElementSibling;
    // BB renders its split hint only where it can split, never on phones.
    const button = sibling instanceof HTMLElement && sibling.matches(SPLIT) ? sibling : null;
    const action = button && actionOf(option);
    if (hint && hint.previousElementSibling === button && hint.ariaLabel === action?.label) return;
    clear();
    if (!button || !action) return;
    const clone = button.cloneNode(true) as HTMLElement;
    const text = clone.querySelector(":scope > span");
    if (!text) return;
    text.textContent = clone.ariaLabel = action.label;
    clone.classList.remove("invisible");
    clone.removeAttribute("aria-hidden");
    clone.removeAttribute("tabindex");
    clone.addEventListener("click", (event) => {
      event.stopPropagation();
      // The action can remove the focused hint; BB's keys need the search focused.
      input?.focus();
      const action = actionOf(option);
      if (action) run(action);
      else sync();
    });
    button.after(clone);
    button.hidden = true;
    hint = clone;
    split = button;
  }
  const rows = new MutationObserver(sync);
  function refresh() {
    const field = doc.querySelector<HTMLElement>(INPUT);
    const next = field && doc.getElementById(field.getAttribute("aria-controls") || "");
    if (next !== list) {
      rows.disconnect();
      // Selection, hover, and new results all re-render the rows.
      if (next) rows.observe(next, {
        subtree: true, childList: true, characterData: true, attributeFilter: ["aria-selected"],
      });
      list = next;
    }
    input = next && field;
    sync();
  }
  const options = { capture: true, signal: lifetime.signal };
  // BB focuses a new thread-search input each time the palette enters the mode.
  doc.addEventListener("focusin", (event) => {
    if (event.target instanceof Element && event.target.matches(INPUT)) refresh();
  }, options);
  doc.addEventListener("keydown", (event) => {
    const field = event.target;
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey
      || event.isComposing || event.keyCode === 229
      || !(field instanceof Element && field.matches(INPUT))) return;
    // Only while the row's hint names the action, so a BB that changes the row
    // or the key keeps its own ⌘↵.
    const action = hint && actionOf(selected(field));
    if (!action) return;
    // Before React's listener on its root, where BB opens the row in split.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) run(action);
  }, options);
  refresh();
  return () => {
    lifetime.abort();
    rows.disconnect();
    clear();
  };
}
