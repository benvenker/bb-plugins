import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Drawer } from "vaul";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { UsageAccount, rpcContract } from "./server";
import {
  formatDuration,
  formatPercent,
  type ProviderUsage,
  type ResetPlan,
} from "./usage-model";

export const DAY_MS = 24 * 60 * 60_000;

/** A version 4 UUID; `crypto.randomUUID` needs a secure context. */
function newRequestId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const variant = "89ab"[Number.parseInt(hex[16]!, 16) & 3];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/** The account's name, then its email and plan when they add to it. */
export function describeAccount({ label, email, plan }: UsageAccount): string {
  const name = label ?? email ?? "the account";
  const details = [email === name ? null : email, plan].filter(Boolean);
  return details.length === 0 ? name : `${name} (${details.join(", ")})`;
}

/** "Oct 22", with the year when it isn't this one and the time within a day. */
export function formatDate(at: number, now: number): string {
  const date = new Date(at);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === new Date(now).getFullYear()
      ? {}
      : { year: "numeric" }),
    ...(at - now < DAY_MS ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

/**
 * Marks a portaled element as the plugin's, so its styles apply and bb's
 * sidebar drawer leaves focus in it.
 */
const PORTAL_SCOPE = {
  "data-bb-portaled-overlay": "",
  "data-bb-plugin-root": "",
  "data-bb-plugin": "pool-usage",
  "data-pool-usage-reset": "",
};

/** bb's dialog, bottom sheet, and button classes. */
const OVERLAY_CLASS =
  "fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";
const DIALOG_CLASS =
  "fixed left-[50%] top-[50%] z-50 grid w-full grid-cols-[minmax(0,1fr)] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-sm duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg";
const SHEET_CLASS =
  "fixed inset-x-0 bottom-0 z-50 mt-24 grid grid-cols-[minmax(0,1fr)] gap-4 rounded-t-xl border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none";
export const BUTTON_CLASS =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
export const SECONDARY_BUTTON_CLASS = `${BUTTON_CLASS} border border-input bg-transparent hover:bg-state-hover hover:text-foreground`;

/** A phone, where bb's dialogs are bottom sheets. */
const PHONE_QUERY = "(max-width: 767px)";

/** bb's dialog, or its bottom sheet on a phone. */
export function Modal({
  open,
  onOpenChange,
  dismissible = true,
  className = "max-w-lg",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dismissible?: boolean;
  /** Extra classes for the dialog, such as its width. */
  className?: string;
  children: ReactNode;
}) {
  return window.matchMedia?.(PHONE_QUERY).matches ? (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      dismissible={dismissible}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          {...PORTAL_SCOPE}
          className="fixed inset-0 z-50 bg-black/40"
        />
        <Drawer.Content {...PORTAL_SCOPE} className={SHEET_CLASS}>
          <div className="mx-auto my-3.5 h-1 w-10 rounded-full bg-muted-foreground/20" />
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  ) : (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay {...PORTAL_SCOPE} className={OVERLAY_CLASS} />
        <Dialog.Content
          {...PORTAL_SCOPE}
          className={`${DIALOG_CLASS} ${className}`}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A provider's usage with the name bb shows for it. */
export type NamedUsage = ProviderUsage & { name: string };

interface ResetRequest {
  usage: NamedUsage;
  plan: ResetPlan;
  now: number;
  /** Sent with every try, so a retry never spends a second reset. */
  requestId: string;
}

/** A refusal keeps the reset; a failed try may be repeated as is. */
type Attempt = "asking" | "spending" | { refused: boolean; message: string };

/**
 * "Use reset", which asks before it spends the account's next reset and
 * says what it changes.
 */
export function UseResetButton({
  usage,
  plan,
  now,
  onUsed,
}: {
  usage: NamedUsage;
  /** What spending the account's next reset changes. */
  plan: ResetPlan;
  now: number;
  onUsed: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  // The request outlives the dialog's closing animation.
  const [request, setRequest] = useState<ResetRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState<Attempt>("asking");
  const spending = attempt === "spending";
  const failed = typeof attempt === "object";

  const spend = ({ usage, plan, requestId }: ResetRequest) => {
    setAttempt("spending");
    void rpc
      .call("reset_use", { accountId: plan.account.id, requestId })
      .then(
        (result) => {
          if (result.outcome === "refused") {
            setAttempt({ refused: true, message: result.message });
            return;
          }
          setOpen(false);
          toast.success(`Used a ${usage.name} reset`, {
            description: `On ${describeAccount(plan.account)}.`,
          });
        },
        (error: unknown) =>
          setAttempt({
            refused: false,
            message:
              error instanceof Error
                ? error.message
                : "Couldn't use the reset. Try again.",
          }),
      )
      .finally(onUsed);
  };

  let dialog = null;
  if (request !== null) {
    const { usage, plan, now } = request;
    const left = usage.availableResets - 1;
    dialog = (
      // Closing mid-spend would hide how it ended.
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!spending) setOpen(next);
        }}
        dismissible={!spending}
      >
        <div className="flex flex-col space-y-1.5 text-left">
          <Dialog.Title className="text-base font-semibold leading-none tracking-tight">
            Use a {usage.name} reset?
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            Are you sure you want to use a reset
            {plan.expiresAt === null
              ? ""
              : `, valid until ${formatDate(plan.expiresAt, now)},`}{" "}
            on {describeAccount(plan.account)} to drop {usage.name} from{" "}
            {formatPercent(plan.used.before)} to{" "}
            {formatPercent(plan.used.after)}?
          </Dialog.Description>
        </div>
        <p className="text-sm text-muted-foreground">
          The account goes from {formatPercent(plan.accountUsed.before)} to{" "}
          {formatPercent(plan.accountUsed.after)} used.{" "}
          {plan.freesAt === null
            ? "On its own, it doesn't free up within a week."
            : `On its own, it frees up in ${formatDuration(plan.freesAt - now)}.`}{" "}
          {left <= 0
            ? "This is the last reset available."
            : left === 1
              ? "1 reset stays available."
              : `${left} resets stay available.`}
        </p>
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            {attempt.message}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={SECONDARY_BUTTON_CLASS}
            disabled={spending}
            onClick={() => setOpen(false)}
          >
            {failed && attempt.refused ? "Close" : "Cancel"}
          </button>
          {failed && attempt.refused ? null : (
            <button
              type="button"
              className={`${BUTTON_CLASS} bg-foreground text-background hover:bg-foreground/90`}
              disabled={spending}
              onClick={() => spend(request)}
            >
              {spending ? "Using reset…" : failed ? "Try again" : "Use reset"}
            </button>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <>
      <button
        type="button"
        className="pool-usage-use"
        aria-label={`Use a reset on ${describeAccount(plan.account)}`}
        onClick={() => {
          setRequest({ usage, plan, now, requestId: newRequestId() });
          setAttempt("asking");
          setOpen(true);
        }}
      >
        Use reset
      </button>
      {dialog}
    </>
  );
}
