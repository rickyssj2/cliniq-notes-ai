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
   * `server` applies a remote/authoritative transition: MFA is trusted,
   * actor may be the remote party. `user` is a local intent gate.
   */
  source?: "user" | "server";
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

export type AvailableAction = {
  action: NoteAction;
  to: NoteStatus;
  enabled: boolean;
  /** Present when disabled — safe to show in tooltips. */
  reason?: string;
};

export const AMEND_GRACE_MS = 24 * 60 * 60 * 1000;
