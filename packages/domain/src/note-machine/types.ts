import type { NoteStatus, Role } from "../types";

/** User- or server-initiated lifecycle triggers. */
export const NOTE_ACTIONS = [
  "generation.complete",
  "generation.error",
  "regenerate",
  "start_review",
  "return",
  "approve",
  "reject",
  "resubmit",
  "amend",
  "grace_expired",
] as const;

export type NoteAction = (typeof NOTE_ACTIONS)[number];

export type ActorRef = {
  id: string;
  role: Role;
};

/**
 * Pure evaluation context. `now` / `approvedAt` are ISO strings so tests
 * can freeze time without touching Date.now globally.
 */
export type MachineContext = {
  status: NoteStatus;
  assignedReviewerId: string | null;
  /** When the note entered APPROVED — used for the 24h amend grace window. */
  approvedAt: string | null;
  /** Clock used for grace checks. Defaults to "now" at call sites. */
  now: string;
  actor: ActorRef | null;
  /** Required for reject. */
  reason?: string;
  /** Required for user-initiated approve. */
  mfaVerified?: boolean;
  /**
   * `user` is a person asking for something and must clear the intent gates
   * (MFA, grace window). `system` is a transition that was already decided —
   * an elapsed timer, or one observed from an authoritative source — so those
   * gates do not apply a second time.
   */
  source?: "user" | "system";
};

export type TransitionEffect =
  | { type: "assign_reviewer"; reviewerId: string }
  | { type: "release_reviewer" }
  | { type: "require_new_version" }
  | { type: "record_approved_at"; at: string }
  | { type: "clear_approved_at" };

export type TransitionSuccess = {
  ok: true;
  action: NoteAction;
  from: NoteStatus;
  to: NoteStatus;
  effects: TransitionEffect[];
};

export type TransitionFailure = {
  ok: false;
  action: NoteAction;
  from: NoteStatus;
  reason: string;
};

export type TransitionResult = TransitionSuccess | TransitionFailure;

/** The lifecycle fields every adapter keeps for a note, whatever it calls them. */
export type LifecycleState = {
  status: NoteStatus;
  assignedReviewerId: string | null;
  approvedAt: string | null;
};

export type AppliedTransition = LifecycleState & {
  /**
   * Content must continue on a fresh version row. Version rows are storage the
   * core knows nothing about, so this stays a flag for the adapter to honour.
   */
  requiresNewVersion: boolean;
};

export type AvailableAction = {
  action: NoteAction;
  to: NoteStatus;
  enabled: boolean;
  /** Present when disabled — safe to show in tooltips. */
  reason?: string;
};

export const AMEND_GRACE_MS = 24 * 60 * 60 * 1000;
