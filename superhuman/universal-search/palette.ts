import { defaultFilter } from "cmdk";
import { changedOutside, LIVE_OUTPUT } from "../lib/mutations";
import { alternateQuery } from "./layout";
import { commandRow } from "./host";

const ROOT = '[data-testid="command-palette"]';
const INPUT = 'input[aria-label="Search commands"]';
const ITEM = "[data-palette-action-kind]";
const EXTRA = "data-superhuman-search-result";
const ACTIVE = ["bg-state-hover", "text-foreground"];
type Candidate = NonNullable<ReturnType<typeof commandRow>> & { template: HTMLElement };

/** Supplement native rows, retaining their actions and restoring their selection on cleanup. */
export function installPaletteSearch(doc: Document) {
  const lifetime = new AbortController();
  const candidates = new Map<string, Candidate>();
  let root: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let rows: HTMLElement[] = [], extras: HTMLElement[] = [];
  let selected: HTMLElement | null = null;
  let previous: unknown[] = [];
  let restore = () => {};
  let frame = 0;

  function clear() {
    restore();
    restore = () => {};
    rows = extras = [];
    selected = null;
    previous = [];
  }
  function select(row: HTMLElement) {
    for (const item of rows) {
      item.ariaSelected = String(item === row);
      for (const name of ACTIVE) item.classList.toggle(name, item === row);
    }
    selected = row;
    input!.setAttribute("aria-activedescendant", row.id);
  }
  function refresh() {
    const next = [...doc.querySelectorAll<HTMLElement>(ROOT)].find((node) =>
      (node.checkVisibility?.() ?? node.getClientRects().length > 0)
      && !node.closest('[data-state="closed"], [inert], [aria-hidden="true"]'),
    ) ?? null;
    if (next !== root) {
      clear();
      root = next;
      candidates.clear();
    }
    const field = root?.querySelector<HTMLInputElement>(INPUT) ?? null;
    if (field !== input) clear();
    input = field;
    if (!root || !field) return;
    const query = field.value.replace(/^>/, "");
    const native = [...root.querySelectorAll<HTMLElement>(`${ITEM}:not([${EXTRA}])`)];
    // Extra rows show their selection as BB shows its own; when BB draws it
    // another way, the arrows would move a selection nobody sees.
    const chosen = native.find((row) => row.ariaSelected === "true");
    if (chosen && !ACTIVE.every((name) => chosen.classList.contains(name))) {
      candidates.clear();
      return clear();
    }
    const current = new Set<string>();
    const capture = !query.trim() || !candidates.size;
    for (const row of native) {
      const action = commandRow(row);
      if (!action) return clear();
      current.add(action.id);
      if (capture) candidates.set(action.id, { ...action, template: row.cloneNode(true) as HTMLElement });
    }
    const alternate = alternateQuery(query);
    const list = doc.getElementById(field.getAttribute("aria-controls") ?? "");
    if (!alternate || !list || !root.contains(list)) return clear();
    const empty = [...root.querySelectorAll("p")].find((p) => p.textContent === "No matching commands");
    const view = [field, list, query, empty, ...native, ...current];
    if (view.length === previous.length && view.every((item, i) => item === previous[i])
      && extras.every((row) => row.parentElement === list)) return;
    clear();
    previous = view;
    extras = [...candidates.values()]
      .map((candidate) => ({ candidate, score: defaultFilter(candidate.title, alternate, [candidate.group]) }))
      .filter(({ candidate, score }) => score > 0 && !current.has(candidate.id))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, 50 - native.length))
      .map(({ candidate }, index) => {
        const row = candidate.template.cloneNode(true) as HTMLElement;
        row.id = `${list.id}-superhuman-${index}`;
        row.setAttribute(EXTRA, candidate.id);
        row.addEventListener("click", candidate.select);
        list.append(row);
        return row;
      });
    if (!extras.length) return;
    rows = [...native, ...extras];
    const selection = native.map((row) => ({ row, className: row.className, selected: row.ariaSelected }));
    const descendant = field.getAttribute("aria-activedescendant");
    const hidden = empty?.hidden ?? false;
    restore = () => {
      extras.forEach((row) => row.remove());
      for (const { row, className, selected } of selection) {
        row.className = className;
        row.ariaSelected = selected;
      }
      if (descendant === null) field.removeAttribute("aria-activedescendant");
      else field.setAttribute("aria-activedescendant", descendant);
      if (empty) empty.hidden = hidden;
    };
    if (empty) empty.hidden = true;
    select(native.find((row) => row.ariaSelected === "true") ?? rows[0]!);
  }
  function schedule() {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (!lifetime.signal.aborted) refresh();
    });
  }
  const options = { capture: true, signal: lifetime.signal };
  doc.addEventListener("input", (event) => {
    // Typing anywhere else, such as in the prompt, leaves the palette alone.
    if (!(event.target instanceof Element && event.target.closest(ROOT))) return;
    clear();
    refresh(); // Capture unfiltered commands before React handles the first character.
    schedule();
  }, options);
  doc.addEventListener("keydown", (event) => {
    if (!extras.length || event.target !== input || event.isComposing || event.keyCode === 229
      || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const index = rows.indexOf(selected!);
    const next: Record<string, number> = {
      ArrowDown: (index + 1) % rows.length,
      ArrowUp: (index + rows.length - 1) % rows.length,
      Home: 0, End: rows.length - 1,
    };
    if (event.key !== "Enter" && next[event.key] === undefined) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Enter") selected!.click();
    else {
      select(rows[next[event.key]!]!);
      selected!.scrollIntoView({ block: "nearest" });
    }
  }, options);
  doc.addEventListener("pointermove", (event) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>(ITEM) : null;
    if (row && rows.includes(row)) {
      event.stopImmediatePropagation();
      select(row);
    }
  }, options);
  const observer = new MutationObserver((records) => {
    if (!frame && changedOutside(records, LIVE_OUTPUT)) schedule();
  });
  observer.observe(doc.body, { subtree: true, childList: true, attributeFilter: ["data-state"] });
  refresh();
  return () => {
    lifetime.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    clear();
  };
}
