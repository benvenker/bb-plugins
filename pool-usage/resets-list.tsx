import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ResetDetail, UsageAccount } from "./server";
import {
  countsTowardCapacity,
  formatDuration,
  formatPercent,
  resetWarning,
  type ResetWarning,
} from "./usage-model";
import {
  DAY_MS,
  Modal,
  SECONDARY_BUTTON_CLASS,
  UseResetButton,
  formatDate,
  type NamedUsage,
} from "./reset-dialog";

/** The windows' names, by their length in minutes. */
const WINDOW_NAMES: Record<number, string> = {
  300: "5-hour",
  1_440: "Daily",
  10_080: "Weekly",
};

function windowName(minutes: number | null): string {
  if (minutes === null) return "Limit";
  return WINDOW_NAMES[minutes] ?? formatDuration(minutes * 60_000);
}

/** What a reset clears, such as "5-hour and weekly limits". */
function describeClears({ clears, clearsOther }: ResetDetail): string {
  if (clears === null) return "Clears all limits";
  const names = [
    ...clears.map((minutes) => windowName(minutes).toLowerCase()),
    ...clearsOther,
  ];
  if (names.length === 0) return "Claude doesn't say what it clears";
  return `Clears ${names.join(" and ")} ${names.length === 1 ? "limit" : "limits"}`;
}

const BLOCKERS: Record<NonNullable<ResetDetail["blocked"]>, string> = {
  paused: "Paused",
  ineligible: "Claude doesn't let this account use it",
  cooldown: "Cooling down",
  queued: "Waits for the grant before it",
  "needs-limit": "Needs the account to be at a limit",
  unavailable: "Can't be used right now",
  unsupported: "Not supported by the account's plan",
};

function describeState(
  { blocked, blockedUntil }: ResetDetail,
  now: number,
): string {
  if (blocked === null) return "Can be used now";
  if (blocked === "cooldown" && blockedUntil !== null) {
    return `Cooling down until ${formatDate(blockedUntil, now)}`;
  }
  return BLOCKERS[blocked];
}

/** "Dec 11 (30 days left)", or "Today, 3:00 PM (5h left)" within a day. */
function describeExpiry(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return "No expiry date";
  const left = expiresAt - now;
  const days = Math.floor(left / DAY_MS);
  return `Expires ${formatDate(expiresAt, now)} (${
    days >= 2 ? `${days} days` : formatDuration(left)
  } left)`;
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

function describeWarning(warning: ResetWarning, now: number): string {
  return warning.kind === "expiring"
    ? `Use or lose: a reset expires in ${formatDuration(warning.at - now)}.`
    : `Use or lose: ${plural(warning.resets, "reset")} ${
        warning.resets === 1 ? "expires" : "expire"
      } by ${formatDate(
        warning.by,
        now,
      )}, but the ${windowName(warning.minutes).toLowerCase()} limit resets on its own only ${plural(
        warning.natural,
        "time",
      )} before then.`;
}

/** Why the provider has no reset to use first. */
function noResetReason(usage: NamedUsage): string {
  if (usage.used === null) return `${usage.name}'s usage isn't known.`;
  if (usage.accountPlans.size === 0) {
    return "None of them can be used right now.";
  }
  return `Using one wouldn't lower ${usage.name} from ${formatPercent(
    usage.used,
  )}: the accounts holding them have room left or free up on their own soon.`;
}

function ResetRow({
  item,
  first,
  now,
}: {
  item: ResetDetail;
  /** This is the reset to use first. */
  first: boolean;
  now: number;
}) {
  return (
    <li className="pool-usage-reset-row" data-blocked={item.blocked !== null}>
      <span className="pool-usage-reset-main">
        {item.title === null ? null : <strong>{item.title}</strong>}
        <span>{describeExpiry(item.expiresAt, now)}</span>
        <span>{describeClears(item)}</span>
      </span>
      <span className="pool-usage-reset-side">
        <span>{plural(item.count, "reset")}</span>
        <span className="pool-usage-reset-state">
          {describeState(item, now)}
          {item.counted ? "" : " · not in the total"}
        </span>
        {first ? <span className="pool-usage-first">Use first</span> : null}
      </span>
    </li>
  );
}

function AccountResets({
  usage,
  account,
  now,
  onUsed,
}: {
  usage: NamedUsage;
  account: UsageAccount & { resets: NonNullable<UsageAccount["resets"]> };
  now: number;
  onUsed: () => void;
}) {
  const { resets } = account;
  const plan = usage.accountPlans.get(account.id);
  const first = usage.resetPlan?.account.id === account.id;
  const warning = resets.failed ? null : resetWarning(account, now);
  const details = [account.email === account.label ? null : account.email, account.plan]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      className="pool-usage-account"
      aria-label={account.label ?? account.email ?? account.id}
    >
      <header>
        <span className="pool-usage-account-name">
          <strong>{account.label ?? account.email ?? "Account"}</strong>
          {details === "" ? null : <span>{details}</span>}
        </span>
        <span className="pool-usage-account-count">
          {resets.failed
            ? null
            : plural(account.availableResets ?? 0, "reset")}
        </span>
        {plan === undefined || resets.failed ? null : (
          <UseResetButton usage={usage} plan={plan} now={now} onUsed={onUsed} />
        )}
      </header>
      {account.windows.length === 0 ? null : (
        <ul className="pool-usage-windows" aria-label="Limits">
          {account.windows.map((window, index) => (
            <li key={index}>
              {windowName(window.minutes)}:{" "}
              {window.rejected
                ? "at its limit"
                : window.utilization === null
                  ? "usage unknown"
                  : `${formatPercent(window.utilization)} used`}
              ,{" "}
              {window.resetAt === null
                ? "starts with the next request"
                : window.resetAt <= now
                  ? "reset already"
                  : `resets in ${formatDuration(window.resetAt - now)}`}
            </li>
          ))}
        </ul>
      )}
      {warning === null ? null : (
        <p className="pool-usage-warning">{describeWarning(warning, now)}</p>
      )}
      {resets.failed ? (
        <p className="pool-usage-failed" role="status">
          Couldn't read resets
          {resets.readAt === null
            ? "."
            : `. Last read ${formatDuration(now - resets.readAt)} ago.`}
        </p>
      ) : resets.items.length === 0 ? null : (
        <ul className="pool-usage-reset-rows" aria-label="Resets">
          {resets.items.map((item, index) => (
            <ResetRow
              key={index}
              item={item}
              first={first && item.next}
              now={now}
            />
          ))}
        </ul>
      )}
    </article>
  );
}

/** The accounts the list shows: the ones whose resets were read. */
function withResets(usage: NamedUsage) {
  return usage.accounts.filter(
    (account): account is UsageAccount & {
      resets: NonNullable<UsageAccount["resets"]>;
    } => account.resets !== undefined && countsTowardCapacity(account),
  );
}

function ProviderResets({
  usage,
  now,
  onUsed,
}: {
  usage: NamedUsage;
  now: number;
  onUsed: () => void;
}) {
  const plan = usage.resetPlan;
  return (
    <section
      className="pool-usage-provider-resets"
      aria-label={`${usage.name} resets`}
    >
      <h3>
        {usage.name}
        <span>{usage.availableResets} available</span>
      </h3>
      {plan !== null ? (
        <p className="pool-usage-advice">
          <strong>Use first:</strong> a reset on{" "}
          {plan.account.label ?? plan.account.email ?? "one account"}. Brings{" "}
          {usage.name} from {formatPercent(plan.used.before)} to{" "}
          {formatPercent(plan.used.after)}.
        </p>
      ) : usage.availableResets > 0 ? (
        <p className="pool-usage-advice">
          <strong>No reset is worth using now.</strong> {noResetReason(usage)}
        </p>
      ) : null}
      {withResets(usage).map((account) => (
        <AccountResets
          key={account.id}
          usage={usage}
          account={account}
          now={now}
          onUsed={onUsed}
        />
      ))}
    </section>
  );
}

/** Whether a provider has resets to list, or reads of them that failed. */
export function hasResetList(usage: NamedUsage): boolean {
  return withResets(usage).some(
    ({ resets }) => resets.failed || resets.items.length > 0,
  );
}

/**
 * "View resets (N available)" on a provider's card. It opens the list of
 * every reset on every provider, this one first, and spends nothing.
 */
export function ViewResetsButton({
  usage,
  all,
  now,
  onUsed,
}: {
  usage: NamedUsage;
  /** Every provider's usage, for the list. */
  all: readonly NamedUsage[];
  now: number;
  onUsed: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!hasResetList(usage)) return null;
  const providers = [
    usage,
    ...all.filter(
      (other) => other.provider !== usage.provider && hasResetList(other),
    ),
  ];
  return (
    <>
      <button
        type="button"
        className="pool-usage-reset"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        View resets <span>({usage.availableResets} available)</span>
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
      >
        <div className="flex flex-col space-y-1.5 text-left">
          <Dialog.Title className="text-base font-semibold leading-none tracking-tight">
            Resets
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            A reset clears an account's limits early. Every reset Account
            Pooler's accounts hold, and when each one runs out.
          </Dialog.Description>
        </div>
        <div className="pool-usage-resets">
          {providers.map((each) => (
            <ProviderResets
              key={each.provider}
              usage={each}
              now={now}
              onUsed={onUsed}
            />
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      </Modal>
    </>
  );
}
