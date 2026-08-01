import type { NoteStatus } from "../types";
import type {
  ActorRef,
  MachineContext,
  NoteAction,
  TransitionEffect,
} from "./types";
import { AMEND_GRACE_MS } from "./types";

export type TransitionDef = {
  action: NoteAction;
  from: NoteStatus;
  to: NoteStatus;
  /** Auto / system triggers are not offered as user buttons. */
  kind: "user" | "auto";
  guard: (ctx: MachineContext) => string | null;
  effects: (ctx: MachineContext) => TransitionEffect[];
};

function roleIn(
  actor: ActorRef | null,
  roles: ActorRef["role"][],
): string | null {
  if (!actor) return "An authenticated actor is required";
  if (!roles.includes(actor.role)) {
    return `Requires role ${roles.join(" or ")}; you are ${actor.role}`;
  }
  return null;
}

function isAssignedReviewer(ctx: MachineContext): string | null {
  if (!ctx.actor) return "An authenticated actor is required";
  if (!ctx.assignedReviewerId) {
    return "No reviewer is assigned to this note";
  }
  if (ctx.actor.id !== ctx.assignedReviewerId) {
    return "You are not the assigned reviewer";
  }
  return null;
}

/** ADMIN may override assignment guards (break-glass supervision). */
function isAssignedReviewerOrAdmin(ctx: MachineContext): string | null {
  if (!ctx.actor) return "An authenticated actor is required";
  if (ctx.actor.role === "ADMIN") return null;
  return isAssignedReviewer(ctx);
}

function withinAmendGrace(ctx: MachineContext): string | null {
  if (!ctx.approvedAt) {
    return "Approval timestamp is missing; cannot amend";
  }
  const approvedAt = Date.parse(ctx.approvedAt);
  const now = Date.parse(ctx.now);
  if (Number.isNaN(approvedAt) || Number.isNaN(now)) {
    return "Invalid approval or clock timestamp";
  }
  if (now - approvedAt > AMEND_GRACE_MS) {
    return "Note is past the 24h amendment grace window";
  }
  return null;
}

/** Single source of truth for legal edges. UI and API both consult this. */
export const TRANSITIONS: readonly TransitionDef[] = [
  {
    action: "generation.complete",
    from: "GENERATING",
    to: "READY_FOR_REVIEW",
    kind: "auto",
    guard: () => null,
    effects: () => [],
  },
  {
    action: "generation.error",
    from: "GENERATING",
    to: "FAILED",
    kind: "auto",
    guard: () => null,
    effects: () => [],
  },
  {
    action: "regenerate",
    from: "FAILED",
    to: "GENERATING",
    kind: "user",
    guard: (ctx) => roleIn(ctx.actor, ["CLINICIAN", "ADMIN"]),
    effects: () => [],
  },
  {
    action: "start_review",
    from: "READY_FOR_REVIEW",
    to: "IN_REVIEW",
    kind: "user",
    guard: (ctx) => roleIn(ctx.actor, ["REVIEWER", "ADMIN"]),
    effects: (ctx) => [
      { type: "assign_reviewer", reviewerId: ctx.actor!.id },
    ],
  },
  {
    action: "return",
    from: "IN_REVIEW",
    to: "READY_FOR_REVIEW",
    kind: "user",
    guard: (ctx) => isAssignedReviewerOrAdmin(ctx),
    effects: () => [{ type: "release_reviewer" }],
  },
  {
    action: "approve",
    from: "IN_REVIEW",
    to: "APPROVED",
    kind: "user",
    guard: (ctx) => {
      if (!ctx.actor) return "An authenticated actor is required";
      if (ctx.actor.role === "ADMIN") return null;
      const assigned = isAssignedReviewer(ctx);
      if (assigned) return assigned;
      if (ctx.source !== "system" && !ctx.mfaVerified) {
        return "MFA re-authentication is required to approve";
      }
      return null;
    },
    effects: (ctx) => [
      { type: "record_approved_at", at: ctx.now },
      { type: "release_reviewer" },
    ],
  },
  {
    action: "reject",
    from: "IN_REVIEW",
    to: "REJECTED",
    kind: "user",
    guard: (ctx) => {
      const access = isAssignedReviewerOrAdmin(ctx);
      if (access) return access;
      if (!ctx.reason?.trim()) {
        return "A rejection reason is required";
      }
      return null;
    },
    effects: () => [{ type: "release_reviewer" }],
  },
  {
    action: "resubmit",
    from: "REJECTED",
    to: "READY_FOR_REVIEW",
    kind: "user",
    guard: (ctx) => roleIn(ctx.actor, ["CLINICIAN", "ADMIN"]),
    effects: () => [{ type: "require_new_version" }],
  },
  {
    action: "amend",
    from: "APPROVED",
    to: "AMENDED",
    kind: "user",
    guard: (ctx) => {
      const role = roleIn(ctx.actor, ["CLINICIAN", "ADMIN"]);
      if (role) return role;
      return withinAmendGrace(ctx);
    },
    effects: () => [
      { type: "require_new_version" },
      { type: "clear_approved_at" },
    ],
  },
  {
    action: "grace_expired",
    from: "APPROVED",
    to: "LOCKED",
    kind: "auto",
    guard: (ctx) => {
      if (!ctx.approvedAt) {
        return "Approval timestamp is missing; cannot lock";
      }
      const approvedAt = Date.parse(ctx.approvedAt);
      const now = Date.parse(ctx.now);
      if (Number.isNaN(approvedAt) || Number.isNaN(now)) {
        return "Invalid approval or clock timestamp";
      }
      // An already-decided lock is accepted as-is; a request to lock now must
      // wait out the grace window.
      if (ctx.source !== "system" && now - approvedAt < AMEND_GRACE_MS) {
        return "24h amendment grace window has not elapsed yet";
      }
      return null;
    },
    effects: () => [],
  },
  {
    action: "start_review",
    from: "AMENDED",
    to: "IN_REVIEW",
    kind: "user",
    guard: (ctx) => roleIn(ctx.actor, ["REVIEWER", "ADMIN"]),
    effects: (ctx) => [
      { type: "assign_reviewer", reviewerId: ctx.actor!.id },
    ],
  },
] as const;

export function findTransition(
  action: NoteAction,
  from: NoteStatus,
): TransitionDef | undefined {
  return TRANSITIONS.find((t) => t.action === action && t.from === from);
}

export function outgoingUserTransitions(from: NoteStatus): TransitionDef[] {
  return TRANSITIONS.filter((t) => t.from === from && t.kind === "user");
}
