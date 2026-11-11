import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { createPortal } from "react-dom";
import {
  definePluginApp,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
  useRpc,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import type { UsageSnapshot, rpcContract } from "./server";
import {
  countsTowardCapacity,
  formatDuration,
  formatPercent,
  hasSpentQuota,
  isHot,
  redThreshold,
  summarizeUsage,
  type ProviderUsage,
} from "./usage-model";
import { ViewResetsButton } from "./resets-list";
import "./app.css";

const REFRESH_INTERVAL_MS = 30_000;
const CLOCK_INTERVAL_MS = 15_000;
const VISIBLE_STEPS = 4;
/** Shorter names than bb's provider picker uses, for the footer's tight space. */
const SHORT_NAMES: Record<string, string> = { "claude-code": "Claude" };

/**
 * bb's footer markup is not a versioned API. The summary finds the plugin's
 * own footer icon by its test id and stands in for it; when the icon can't
 * be found, the icon and its disclosure stay as they are.
 */
const ANCHOR_SELECTOR =
  '[data-testid="plugin-sidebar-footer-item-pool-usage-pool-usage"]';
const ANCHOR_ATTRIBUTE = "data-pool-usage-anchor";

interface UsageState {
  /** The latest snapshot read; kept when a later read fails. */
  snapshot: UsageSnapshot | null;
  loadError: string | null;
  now: number;
  /** Reads usage now, dropping a read still under way. */
  read: () => void;
}

function useUsage(): UsageState {
  const rpc = useRpc<typeof rpcContract>();
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cancelPending = useRef(() => {});

  const read = useCallback(() => {
    cancelPending.current();
    let current = true;
    cancelPending.current = () => {
      current = false;
    };
    void rpc.call("usage_get").then(
      (result) => {
        if (!current) return;
        setSnapshot(result);
        setLoadError(null);
        setNow(Date.now());
      },
      () => {
        if (current) setLoadError("Usage could not be loaded.");
      },
    );
  }, [rpc]);

  useEffect(() => {
    read();
    const refreshTimer = window.setInterval(read, REFRESH_INTERVAL_MS);
    const clockTimer = window.setInterval(
      () => setNow(Date.now()),
      CLOCK_INTERVAL_MS,
    );
    return () => {
      cancelPending.current();
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, [read]);

  return { snapshot, loadError, now, read };
}

/** A provider's usage with the name and logo bb shows for it. */
interface ProviderSummary extends ProviderUsage {
  name: string;
  logo: ComponentProps<typeof ProviderIcon>["provider"];
}

/**
 * Each provider's usage, named and ordered as in bb's provider picker. Null
 * until both the usage and bb's providers have loaded.
 */
function useSummaries(
  snapshot: UsageSnapshot | null,
  now: number,
): ProviderSummary[] | null {
  const directory = useProviders();
  return useMemo(() => {
    if (snapshot === null || directory.status === "loading") return null;
    const rank = (provider: string) => {
      const index = directory.providers.findIndex(({ id }) => id === provider);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return summarizeUsage(snapshot, now)
      .map((usage) => {
        const info = directory.providers.find(
          ({ id }) => id === usage.provider,
        );
        return {
          ...usage,
          name:
            SHORT_NAMES[usage.provider] ?? info?.displayName ?? usage.provider,
          // Without the provider's tint, the logo follows the text color.
          logo: {
            id: usage.provider,
            logoUrl: info?.logoUrl ?? null,
            icon: info?.icon ?? null,
          },
        };
      })
      .sort((a, b) => rank(a.provider) - rank(b.provider));
  }, [snapshot, now, directory]);
}

function useRedThreshold(): number {
  return redThreshold(useSettings().values);
}

function Percent({ value, threshold }: { value: number; threshold: number }) {
  return (
    <span className={isHot(value, threshold) ? "pool-usage-hot" : undefined}>
      {formatPercent(value)}
    </span>
  );
}

/**
 * The provider's total, then what it drops to at each upcoming reset, then
 * a line that lists the resets its accounts hold.
 */
function UsageCard({
  usage,
  all,
  threshold,
  now,
  onUsed,
}: {
  usage: ProviderSummary;
  /** Every provider's usage, for the list of resets. */
  all: readonly ProviderSummary[];
  threshold: number;
  now: number;
  /** Runs once a try to spend a reset settles. */
  onUsed: () => void;
}) {
  const accounts = usage.accounts.filter(countsTowardCapacity).length;
  return (
    <section className="pool-usage-card" aria-label={`${usage.name} usage`}>
      <header className="pool-usage-head">
        <ProviderIcon
          providerKind="agent"
          provider={usage.logo}
          className="pool-usage-logo"
        />
        <span className="pool-usage-name">
          {usage.name}
          {accounts > 1 ? <small>{accounts}x</small> : null}
        </span>
        <span className="pool-usage-total">
          {usage.used === null ? (
            "—"
          ) : (
            <Percent value={usage.used} threshold={threshold} />
          )}
        </span>
      </header>
      {!hasSpentQuota(usage) ? null : usage.steps.length > 0 ? (
        <ol className="pool-usage-steps" aria-label="Upcoming resets">
          {usage.steps.slice(0, VISIBLE_STEPS).map((step) => (
            <li key={step.at}>
              <span>{formatDuration(step.at - now)}</span>
              <Percent value={step.used} threshold={threshold} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="pool-usage-note">No resets in the next 7 days</p>
      )}
      <ViewResetsButton usage={usage} all={all} now={now} onUsed={onUsed} />
    </section>
  );
}

function UsageDisclosure() {
  const { snapshot, loadError, now, read } = useUsage();
  const summaries = useSummaries(snapshot, now);
  const threshold = useRedThreshold();

  if (summaries === null) {
    return <p role="status">{loadError ?? "Loading account usage…"}</p>;
  }
  if (summaries.length === 0) {
    return (
      <p role="status">
        No usage to show. Sign in to a provider or add accounts to Account
        Pooler.
      </p>
    );
  }
  return (
    <div className="pool-usage-panel">
      {summaries.map((usage) => (
        <UsageCard
          key={usage.provider}
          usage={usage}
          all={summaries}
          threshold={threshold}
          now={now}
          onUsed={read}
        />
      ))}
    </div>
  );
}

/** bb's spacer between its footer items and the badges at the row's end. */
function footerSpacer(row: Element): Element | null {
  for (const child of row.children) {
    if (
      child.tagName === "LI" &&
      child.getAttribute("aria-hidden") === "true"
    ) {
      return child;
    }
  }
  return null;
}

/**
 * Right after the spacer, so the row's items and the summary share the
 * bottom line and bb's badges wrap above it. Last in rows without one.
 */
function placeInRow(item: Element, row: Element): void {
  const spacer = footerSpacer(row);
  if (spacer === null) {
    if (item.parentElement !== row || item.nextElementSibling !== null) {
      row.append(item);
    }
  } else if (item.previousElementSibling !== spacer) {
    spacer.after(item);
  }
}

/**
 * Places a list item in the footer row that holds the plugin's icon and
 * hides the icon while the item is there. Returns null while the icon can't
 * be found.
 */
function useFooterSlot(enabled: boolean): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const item = document.createElement("li");
    item.className = "pool-usage-footer";
    let anchor: Element | null = null;
    let frame: number | null = null;

    const setAnchor = (next: Element | null) => {
      if (next === anchor) return;
      anchor?.removeAttribute(ANCHOR_ATTRIBUTE);
      next?.setAttribute(ANCHOR_ATTRIBUTE, "");
      anchor = next;
    };

    const attach = () => {
      frame = null;
      // The app mutates the DOM constantly; skip the lookup while in place.
      const current = anchor?.isConnected ? anchor.parentElement : null;
      if (current != null && item.parentElement === current) {
        placeInRow(item, current);
        return;
      }
      const next =
        document
          .querySelector(ANCHOR_SELECTOR)
          ?.closest("li[data-footer-item]") ?? null;
      const row = next?.parentElement ?? null;
      if (next === null || row === null) {
        setAnchor(null);
        item.remove();
        setSlot(null);
        return;
      }
      setAnchor(next);
      placeInRow(item, row);
      setSlot(item);
    };

    const observer = new MutationObserver(() => {
      frame ??= window.requestAnimationFrame(attach);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    attach();

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      setAnchor(null);
      item.remove();
      setSlot(null);
    };
  }, [enabled]);

  return slot;
}

type MeasuredSummary = ProviderSummary & { used: number };

/** bb's dropdown menu surface, so the card looks like the footer's "…" menu. */
const MENU_CLASS =
  "z-50 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=top]:slide-in-from-bottom-2 data-[side=bottom]:slide-in-from-top-2";

/**
 * A provider's card next to its footer button, on the side with more room,
 * open until Escape or a press outside.
 */
function UsagePopover({
  anchor,
  onClose,
  ...card
}: ComponentProps<typeof UsageCard> & {
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The reset's confirmation, over the card, closes first.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !ref.current?.contains(target) &&
        !anchor.contains(target) &&
        target.closest?.("[data-pool-usage-reset]") == null
      ) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [anchor, onClose]);

  const rect = anchor.getBoundingClientRect();
  const { innerWidth, innerHeight } = window;
  // Above a footer at the bottom of the window, below one at the top.
  const above = rect.top > innerHeight - rect.bottom;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${card.usage.name} usage`}
      data-state="open"
      data-side={above ? "top" : "bottom"}
      className={`pool-usage-popover ${MENU_CLASS}`}
      style={{
        ...(above
          ? { bottom: innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
        // Near the right edge, the card grows leftward from the button's end.
        ...(rect.left + rect.right > innerWidth
          ? { right: Math.max(8, innerWidth - rect.right) }
          : { left: Math.max(8, rect.left) }),
      }}
    >
      <UsageCard {...card} />
    </div>,
    document.body,
  );
}

/**
 * A logo and a percentage per provider at the right end of the footer; a
 * click opens that provider's card.
 */
function FooterSummary() {
  const { snapshot, now, read } = useUsage();
  const summaries = useSummaries(snapshot, now);
  const threshold = useRedThreshold();
  const usages = useMemo(
    () =>
      (summaries ?? []).filter(
        (usage): usage is MeasuredSummary => usage.used !== null,
      ),
    [summaries],
  );
  const slot = useFooterSlot(usages.length > 0);
  const [open, setOpen] = useState<{
    provider: string;
    anchor: HTMLElement;
  } | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const openUsage = usages.find(({ provider }) => provider === open?.provider);

  if (slot === null) return null;
  return (
    <>
      {createPortal(
        usages.map((usage) => (
          <button
            key={usage.provider}
            type="button"
            className="pool-usage-button"
            aria-label={`${usage.name}: ${formatPercent(usage.used)} used`}
            aria-expanded={open?.provider === usage.provider}
            onClick={(event) => {
              const anchor = event.currentTarget;
              setOpen((current) =>
                current?.provider === usage.provider
                  ? null
                  : { provider: usage.provider, anchor },
              );
            }}
          >
            <ProviderIcon
              providerKind="agent"
              provider={usage.logo}
              className="pool-usage-logo"
            />
            <Percent value={usage.used} threshold={threshold} />
          </button>
        )),
        slot,
      )}
      {open !== null && openUsage !== undefined ? (
        <UsagePopover
          anchor={open.anchor}
          onClose={close}
          usage={openUsage}
          all={summaries ?? []}
          threshold={threshold}
          now={now}
          onUsed={read}
        />
      ) : null}
    </>
  );
}

export default definePluginApp((app) => {
  app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: "pool-usage",
    label: "Account usage",
    icon: "ChartColumn",
    component: UsageDisclosure,
  });
  app.slots.experimental_appOverlay({
    id: "footer-summary",
    component: FooterSummary,
  });
});
