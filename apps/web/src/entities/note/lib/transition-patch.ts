import {
  can,
  type NoteAction,
  type NoteStatus,
  type UserRef,
} from "@soulside/domain";

type PatchableNote = {
  status: NoteStatus;
  assignedReviewer: UserRef | null;
  approvedAt: string | null;
};

export type TransitionPatch = {
  status: NoteStatus;
  assignedReviewer: UserRef | null;
  approvedAt: string | null;
  updatedAt: string;
};

/**
 * Optimistic note fields for a transition, derived from the machine's effects
 * rather than re-stated per call site — a new effect changes every cache the
 * same way the server changes its record.
 *
 * Returns null when the machine rejects the action; callers then skip the
 * optimistic write and let the server response be the only update.
 */
export function transitionPatch(input: {
  note: PatchableNote;
  action: NoteAction;
  actor: UserRef;
  reason?: string;
  at: string;
}): TransitionPatch | null {
  const decision = can(input.action, {
    status: input.note.status,
    assignedReviewerId: input.note.assignedReviewer?.id ?? null,
    approvedAt: input.note.approvedAt,
    now: input.at,
    actor: { id: input.actor.id, role: input.actor.role },
    reason: input.reason,
    mfaVerified: true,
    source: "user",
  });

  if (!decision.ok) return null;

  let assignedReviewer = input.note.assignedReviewer;
  let approvedAt = input.note.approvedAt;

  for (const effect of decision.effects) {
    switch (effect.type) {
      case "assign_reviewer":
        // Effects carry ids only. The acting user is the one reviewer the
        // client can name; any other id waits for the server response.
        assignedReviewer =
          effect.reviewerId === input.actor.id ? input.actor : assignedReviewer;
        break;
      case "release_reviewer":
        assignedReviewer = null;
        break;
      case "record_approved_at":
        approvedAt = effect.at;
        break;
      case "clear_approved_at":
        approvedAt = null;
        break;
      case "require_new_version":
        // Server branches the version; nothing to patch locally.
        break;
    }
  }

  return {
    status: decision.to,
    assignedReviewer,
    approvedAt,
    updatedAt: input.at,
  };
}
