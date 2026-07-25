import type { NoteStatus } from "../types";
import { findTransition, outgoingUserTransitions, TRANSITIONS } from "./transitions";
import type {
  AvailableAction,
  MachineContext,
  NoteAction,
  TransitionResult,
} from "./types";

function withDefaults(
  ctx: Omit<MachineContext, "now" | "source"> &
    Partial<Pick<MachineContext, "now" | "source">>,
): MachineContext {
  return {
    ...ctx,
    now: ctx.now ?? new Date().toISOString(),
    source: ctx.source ?? "user",
  };
}

/**
 * Validate whether `action` may fire in this context.
 * Components must call this (or use getAvailableActions) — never hard-code status checks.
 */
export function can(
  action: NoteAction,
  ctx: Omit<MachineContext, "now" | "source"> &
    Partial<Pick<MachineContext, "now" | "source">>,
): TransitionResult {
  const full = withDefaults(ctx);
  const def = findTransition(action, full.status);

  if (!def) {
    return {
      ok: false,
      action,
      from: full.status,
      reason: `Action "${action}" is not valid from status ${full.status}`,
    };
  }

  const guardReason = def.guard(full);
  if (guardReason) {
    return {
      ok: false,
      action,
      from: full.status,
      reason: guardReason,
    };
  }

  return {
    ok: true,
    action,
    from: full.status,
    to: def.to,
    effects: def.effects(full),
  };
}

/** Apply a validated transition. Same path for user intent and server-driven events. */
export function transition(
  action: NoteAction,
  ctx: Omit<MachineContext, "now" | "source"> &
    Partial<Pick<MachineContext, "now" | "source">>,
): TransitionResult {
  return can(action, ctx);
}

/**
 * Resolve a server-pushed status change through the machine.
 * Looks up a unique edge matching (from → to); fails if ambiguous or illegal.
 */
export function applyServerStatusChange(
  ctx: Omit<MachineContext, "now" | "source" | "status"> & {
    status: NoteStatus;
    to: NoteStatus;
  } & Partial<Pick<MachineContext, "now">>,
): TransitionResult {
  const full = withDefaults({ ...ctx, source: "server" });
  const matches = TRANSITIONS.filter(
    (t) => t.from === full.status && t.to === ctx.to,
  );

  if (matches.length === 0) {
    return {
      ok: false,
      action: "generation.complete",
      from: full.status,
      reason: `No legal transition from ${full.status} to ${ctx.to}`,
    };
  }

  if (matches.length > 1) {
    // Prefer the edge whose guard passes for the remote actor.
    const viable = matches.find((t) => t.guard(full) === null);
    if (!viable) {
      return {
        ok: false,
        action: matches[0]!.action,
        from: full.status,
        reason: `Multiple edges ${full.status}→${ctx.to}, none pass guards`,
      };
    }
    return can(viable.action, full);
  }

  return can(matches[0]!.action, full);
}

/**
 * UI action bar source of truth: every outgoing user edge for the current status,
 * with enabled/disabled + reason derived from guards.
 */
export function getAvailableActions(
  ctx: Omit<MachineContext, "now" | "source"> &
    Partial<Pick<MachineContext, "now" | "source">>,
): AvailableAction[] {
  const full = withDefaults(ctx);

  if (full.actor?.role === "READONLY_AUDITOR") {
    return outgoingUserTransitions(full.status).map((t) => ({
      action: t.action,
      to: t.to,
      enabled: false,
      reason: "READONLY_AUDITOR cannot perform workflow actions",
    }));
  }

  return outgoingUserTransitions(full.status).map((t) => {
    const result = can(t.action, full);
    if (result.ok) {
      return { action: t.action, to: t.to, enabled: true };
    }
    return {
      action: t.action,
      to: t.to,
      enabled: false,
      reason: result.reason,
    };
  });
}

/** LOCKED notes are read-only for content and workflow (no outgoing user edges). */
export function isContentReadOnly(status: NoteStatus): boolean {
  return status === "LOCKED" || status === "GENERATING";
}
