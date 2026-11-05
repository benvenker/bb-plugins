import { afterEach, expect, it, vi } from "vitest";
import { installSnoozedSearch, type SearchResult } from "./thread-search";

const row = (id: string, updatedAt: number, title = `hello ${id}`, titleFallback: string | null = null) => ({
  thread: { id, updatedAt, title, titleFallback }, matches: [],
});
const ids = (body: { active: { results: SearchResult[] } }) =>
  body.active.results.map(({ thread }) => thread.id);
const native = () => ({
  active: { results: [row("a", 30), row("b", 10), row("c", 50, "other")], total: 3 },
  archived: { results: [row("z", 1)], total: 1 },
});
const endpoint = "https://bb.test/api/v1/threads/search?query=";
type Search = Parameters<typeof installSnoozedSearch>[2];
let stop: () => void;
afterEach(() => stop());
function setup(fetch: typeof globalThis.fetch, search: Search, layouts = true) {
  const host = { fetch, location: new URL("https://bb.test/") as unknown as Location };
  stop = installSnoozedSearch(host, layouts, search);
  return host;
}
const nativeFetch = () => vi.fn<typeof globalThis.fetch>(async () => Response.json(native()));

it("adds snoozed threads to active among BB's title matches, within the limit", async () => {
  const search = vi.fn<Search>(async () => [row("s1", 20), row("s2", 5), row("a", 30)]);
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    ...native(), took: 5, active: { ...native().active, more: true },
  }));
  const response = await setup(fetch, search).fetch(endpoint + "hello&limitPerGroup=4");
  const body = await response.json();
  expect(ids(body)).toEqual(["a", "s1", "b", "s2"]);
  expect(body.active.total).toBe(5);
  // Fields this doesn't read stay as BB sent them.
  expect([body.took, body.active.more]).toEqual([5, true]);
  expect(body.archived).toEqual(native().archived);
});

it("ranks BB's rows as BB does: by a title that matches the whole query", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
    active: {
      results: [
        row("t", 7, "", "Flaky deploy"),
        row("p", 9, "Flaky tests"),
        row("f", 8, "Unrelated", "Flaky deploy"),
      ],
      total: 3,
    },
    archived: { results: [], total: 0 },
  }));
  const host = setup(fetch, async () => [row("r", 5), row("s", 5)]);
  const body = await (await host.fetch(endpoint + "flak dep")).json();
  expect(ids(body)).toEqual(["t", "s", "r", "p", "f"]);
});

it.each([
  [" адфл ", true, ["адфл", "flak"]],
  ["адфл", false, ["адфл"]],
  ["123", true, ["123"]],
])("searches %j with layouts %s as %j", async (query, layouts, queries) => {
  const search = vi.fn<Search>(async () => []);
  await setup(nativeFetch(), search, layouts).fetch(endpoint + encodeURIComponent(query));
  expect(search).toHaveBeenCalledWith(queries, expect.any(AbortSignal));
});

it.each(["failed", "http", "invalid", "none"])("keeps BB's response: %s", async (failure) => {
  const first = failure === "http" ? new Response("failed", { status: 500 })
    : Response.json(failure === "invalid" ? { active: { results: [{ thread: { id: "a" } }], total: 1 } } : native());
  const search = vi.fn<Search>(async () => {
    if (failure === "failed") throw Error("offline");
    return failure === "none" ? [] : [row("s1", 20)];
  });
  expect(await setup(vi.fn(async () => first), search).fetch(endpoint + "hello")).toBe(first);
});

it("leaves other requests alone", async () => {
  const search = vi.fn<Search>();
  await setup(nativeFetch(), search).fetch(endpoint + "hello", { method: "POST" });
  expect(search).not.toHaveBeenCalled();
});
