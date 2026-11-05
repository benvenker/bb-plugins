import { alternateQuery } from "./layout";

type Result = { thread: { id: string }; matches: unknown[] };
type Group = { results: Result[]; total: number };
export type Search = Record<"active" | "archived", Group>;

function merge(first: Search, second: Search, limit: number): Search {
  const group = (name: keyof Search): Group => {
    const seen = new Set<string>();
    const rows = [...first[name].results, ...second[name].results].filter((row) => {
      // Validate the fields we consume; a changed response keeps native results.
      if (typeof row.thread?.id !== "string" || !Array.isArray(row.matches)) {
        throw new Error("Unsupported thread search result");
      }
      if (seen.has(row.thread.id)) return false;
      seen.add(row.thread.id);
      return true;
    });
    // BB has no pagination here; totals cannot reveal the exact union of capped searches.
    // Keeps every row BB sent, and the fields this doesn't read.
    const results = rows.slice(0, Math.max(limit, first[name].results.length));
    return { ...first[name], results, total: rows.length };
  };
  return { ...first, active: group("active"), archived: group("archived") };
}

/** BB's thread-search request as a URL, or null for any other request. */
function threadSearchUrl(host: Pick<Window, "location">, input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : undefined;
  let url: URL;
  try {
    url = new URL(request?.url ?? String(input), host.location.href);
  } catch {
    return null;
  }
  const query = url.searchParams.get("query") ?? "";
  const method = init?.method ?? request?.method ?? "GET";
  return method.toUpperCase() === "GET" && url.origin === host.location.origin
    && url.pathname === "/api/v1/threads/search" && query.trim().length >= 2
    && query.length <= 256 ? url : null;
}

/** BB's request, its limit, and a fetch that is cancelled with it. */
type SearchSide = {
  url: URL;
  limit: number;
  signal: AbortSignal;
  fetch: (url: URL) => Promise<Response>;
};

/**
 * Wraps BB's thread-search requests. `extend` starts its own request beside
 * BB's and resolves to a change of BB's body, or null to keep it; a failure, a
 * cancelled search, or a body of another shape keeps BB's response. Other
 * requests pass through untouched.
 */
export function wrapThreadSearch(
  host: Pick<Window, "fetch" | "location">,
  extend: (side: SearchSide) => Promise<((body: Search) => Search) | null> | null,
) {
  const original = host.fetch;
  const lifetime = new AbortController();
  const wrapped: typeof fetch = async (input, init) => {
    const url = threadSearchUrl(host, input, init);
    if (lifetime.signal.aborted || !url) return original.call(host, input, init);

    const request = input instanceof Request ? input : undefined;
    const controller = new AbortController();
    const { signal } = controller;
    const abort = () => controller.abort();
    const signals = [lifetime.signal, init?.signal ?? request?.signal];
    for (const linked of signals) linked?.addEventListener("abort", abort, { once: true });
    if (signals.some((linked) => linked?.aborted)) abort();
    const primary = original.call(host, input, init);
    // What the search asked for, or BB's default.
    const limit = Math.max(1, Number(url.searchParams.get("limitPerGroup")) || 20);
    const side = signal.aborted ? null : extend({
      url, limit, signal,
      fetch: (other) => original.call(host, request ? new Request(other, request) : other, { ...init, signal }),
    })?.catch(() => null);
    try {
      const response = await primary;
      const change = await side;
      if (!response.ok || !change || signal.aborted) return response;
      try {
        const body = change(await response.clone().json());
        return signal.aborted ? response : withBody(response, body);
      } catch {
        return response;
      }
    } finally {
      abort();
      for (const linked of signals) linked?.removeEventListener("abort", abort);
    }
  };
  host.fetch = wrapped;
  return () => {
    lifetime.abort();
    if (host.fetch === wrapped) host.fetch = original;
  };
}

function withBody(response: Response, body: unknown) {
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag"]) headers.delete(name);
  return new Response(JSON.stringify(body), {
    status: response.status, statusText: response.statusText, headers,
  });
}

/** BB's thread search, also for the query in the other keyboard layout. */
export function installThreadSearch(host: Pick<Window, "fetch" | "location">) {
  return wrapThreadSearch(host, ({ url, limit, fetch }) => {
    const alternate = alternateQuery(url.searchParams.get("query")!);
    if (alternate === null) return null;
    const other = new URL(url);
    other.searchParams.set("query", alternate);
    return fetch(other).then(async (response) => {
      if (!response.ok) return null;
      const second: Search = await response.json();
      return (first: Search) => merge(first, second, limit);
    });
  });
}
