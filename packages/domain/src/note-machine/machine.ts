import type { NoteStatus } from "../types";
import { findTransition, outgoingUserTransitions, TRANSITIONS } from "./transitions";
import type {
  AppliedTransition,
  AvailableAction,
  LifecycleState,
  MachineContext,
  NoteAction,
  TransitionResult,
  TransitionSuccess,
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
 * Validate whether `action` may fire in this context, and return the resulting
 * status plus effects for the caller to apply. Machine state lives with the
 * caller, so validating and "performing" a transition are the same call.
 *
 * User intent and already-decided transitions both come through here;
 * `ctx.source` is the only difference, so there is no laxer path for either.
 *
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

/**
 * Same question as `can`, asked by destination instead of by action — for
 * callers that learn a status changed without being told which edge did it
 * (a pushed event, a reconciliation). Resolves the unique legal edge and
 * evaluates it; fails if none exists or the choice is ambiguous.
 *
 * The caller states its own `source`; the core does not assume that a
 * status-shaped question came from anywhere in particular.
 */
export function canTransitionTo(
  to: NoteStatus,
  ctx: Omit<MachineContext, "now" | "source"> &
    Partial<Pick<MachineContext, "now" | "source">>,
): TransitionResult {
  const full = withDefaults(ctx);
  const matches = TRANSITIONS.filter((t) => t.from === full.status && t.to === to);

  if (matches.length === 0) {
    return {
      ok: false,
      action: "generation.complete",
      from: full.status,
      reason: `No legal transition from ${full.status} to ${to}`,
    };
  }

  if (matches.length > 1) {
    const viable = matches.find((t) => t.guard(full) === null);
    if (!viable) {
      return {
        ok: false,
        action: matches[0]!.action,
        from: full.status,
        reason: `Multiple edges ${full.status}→${to}, none pass guards`,
      };
    }
    return can(viable.action, full);
  }

  return can(matches[0]!.action, full);
}

/**
 * Fold an allowed transition into the lifecycle fields it produces. This is the
 * one place effects are interpreted: adapters store the result and honour
 * `requiresNewVersion`, but never branch on effect types themselves.
 */
export function applyTransition(
  state: LifecycleState,
  result: TransitionSuccess,
): AppliedTransition {
  let assignedReviewerId = state.assignedReviewerId;
  let approvedAt = state.approvedAt;
  let requiresNewVersion = false;

  for (const effect of result.effects) {
    switch (effect.type) {
      case "assign_reviewer":
        assignedReviewerId = effect.reviewerId;
        break;
      case "release_reviewer":
        assignedReviewerId = null;
        break;
      case "record_approved_at":
        approvedAt = effect.at;
        break;
      case "clear_approved_at":
        approvedAt = null;
        break;
      case "require_new_version":
        requiresNewVersion = true;
        break;
    }
  }

  return {
    status: result.to,
    assignedReviewerId,
    approvedAt,
    requiresNewVersion,
  };
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

/** LOCKED / GENERATING notes are always content-locked by status alone. */
export function isContentReadOnly(status: NoteStatus): boolean {
  return status === "LOCKED" || status === "GENERATING";
}

export type ContentEditResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Whether the actor may edit SOAP content. Components must use this rather
 * than status/role checks — mirrors workflow guards (assigned ownership).
 */
export function canEditContent(
  ctx: Pick<MachineContext, "status" | "assignedReviewerId" | "actor">,
): ContentEditResult {
  if (isContentReadOnly(ctx.status)) {
    return {
      ok: false,
      reason: `Content is read-only while status is ${ctx.status}`,
    };
  }
  if (!ctx.actor) {
    return { ok: false, reason: "No actor — cannot edit content" };
  }

  switch (ctx.status) {
    case "IN_REVIEW": {
      const isAssignee = ctx.assignedReviewerId === ctx.actor.id;
      const isAdmin = ctx.actor.role === "ADMIN";
      if (!isAssignee && !isAdmin) {
        return {
          ok: false,
          reason:
            "Only the assigned reviewer or an admin can edit SOAP while in review",
        };
      }
      return { ok: true };
    }
    case "READY_FOR_REVIEW":
      return {
        ok: false,
        reason: "Start review to claim the note before editing SOAP",
      };
    case "REJECTED":
    case "AMENDED":
      if (ctx.actor.role !== "CLINICIAN" && ctx.actor.role !== "ADMIN") {
        return {
          ok: false,
          reason: "Only a clinician (or admin) can edit this note",
        };
      }
      return { ok: true };
    case "APPROVED":
      return {
        ok: false,
        reason: "Approved notes are read-only; use Amend to branch a new version",
      };
    case "FAILED":
      return {
        ok: false,
        reason: "Failed notes are read-only; request regeneration",
      };
    default:
      return {
        ok: false,
        reason: `Content cannot be edited while status is ${ctx.status}`,
      };
  }
}
