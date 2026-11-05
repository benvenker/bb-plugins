import { alternateQuery } from "../universal-search/layout";
import { wrapThreadSearch, type Search } from "../universal-search/threads";
import { matchTitle } from "./search";

export type SearchResult = {
  thread: { id: string; updatedAt: number };
  matches: unknown[];
};

type Titled = { title: string | null; titleFallback: string | null };
type Row = SearchResult & { thread: Titled };
type Group = { results: Row[]; total: number };

const text = (value: unknown) => value === null || typeof value === "string";

const valid = ({ thread, matches }: Row) =>
  typeof thread.id === "string" &&
  typeof thread.updatedAt === "number" &&
  text(thread.title) &&
  text(thread.titleFallback) &&
  Array.isArray(matches);

/** BB's order among title matches: the latest update, then the larger id. */
const before = (a: SearchResult, b: SearchResult) =>
  b.thread.updatedAt - a.thread.updatedAt ||
  (a.thread.id < b.thread.id ? 1 : -1);

/**
 * Adds the threads snoozes hide, which BB's thread search leaves out, to its
 * active results; `search` finds them for the query and, with `layouts`, its
 * other keyboard layout.
 */
export function installSnoozedSearch(
  host: Pick<Window, "fetch" | "location">,
  layouts: boolean,
  search: (queries: string[], signal: AbortSignal) => Promise<SearchResult[]>,
) {
  return wrapThreadSearch(host, ({ url, limit, signal }) => {
    const query = url.searchParams.get("query")!.trim();
    const alternate = layouts ? alternateQuery(query) : null;
    const queries = alternate === null ? [query] : [query, alternate];
    return search(queries, signal).then((rows) =>
      rows.length === 0 ? null : (body: Search) => {
        const { results, total } = body.active as Group;
        if (typeof total !== "number" || !results.every(valid)) {
          throw new Error("Unsupported thread search result");
        }
        const ids = new Set(results.map(({ thread }) => thread.id));
        const added = rows.filter(({ thread }) => !ids.has(thread.id));
        added.sort(before);
        // Snoozed threads match by title, and BB lists title matches first:
        // threads whose title matches the whole query.
        const merged: SearchResult[] = [];
        let next = 0;
        for (const row of results) {
          const { title, titleFallback } = row.thread;
          const titleMatch =
            matchTitle(title || titleFallback || "", [query]) !== null;
          while (
            next < added.length &&
            (!titleMatch || before(added[next]!, row) < 0)
          ) {
            merged.push(added[next++]!);
          }
          merged.push(row);
        }
        merged.push(...added.slice(next));
        return {
          ...body,
          active: {
            ...body.active,
            results: merged.slice(0, limit),
            total: total + added.length,
          },
        };
      },
    );
  });
}
