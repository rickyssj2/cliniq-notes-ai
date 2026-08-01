import {
  applyTransition,
  can,
  canTransitionTo,
  type LifecycleState,
  type NoteAction,
  type NoteStatus,
  type TransitionResult,
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

function lifecycleOf(note: PatchableNote): LifecycleState {
  return {
    status: note.status,
    assignedReviewerId: note.assignedReviewer?.id ?? null,
    approvedAt: note.approvedAt,
  };
}

/**
 * The domain speaks in reviewer ids; the cache renders reviewers. Only the
 * people already in hand can be named — any other id waits for the server.
 */
function nameReviewer(
  reviewerId: string | null,
  known: Array<UserRef | null>,
): UserRef | null {
  if (!reviewerId) return null;
  return known.find((user) => user?.id === reviewerId) ?? null;
}

function patchFrom(
  note: PatchableNote,
  decision: TransitionResult,
  actor: UserRef,
  at: string,
): TransitionPatch | null {
  if (!decision.ok) return null;

  const next = applyTransition(lifecycleOf(note), decision);

  return {
    status: next.status,
    assignedReviewer: nameReviewer(next.assignedReviewerId, [
      note.assignedReviewer,
      actor,
    ]),
    approvedAt: next.approvedAt,
    updatedAt: at,
  };
}

/**
 * Cache fields for an action this user is about to request. Null when the
 * machine rejects it — callers skip the optimistic write and let the server
 * response be the only update.
 */
export function transitionPatch(input: {
  note: PatchableNote;
  action: NoteAction;
  actor: UserRef;
  reason?: string;
  at: string;
}): TransitionPatch | null {
  const decision = can(input.action, {
    ...lifecycleOf(input.note),
    now: input.at,
    actor: { id: input.actor.id, role: input.actor.role },
    reason: input.reason,
    mfaVerified: true,
    source: "user",
  });

  return patchFrom(input.note, decision, input.actor, input.at);
}

/**
 * Cache fields for a status change that already happened elsewhere and reached
 * us as an event. Null when the machine says that edge is not legal — the
 * caller refetches instead of trusting the push.
 */
export function statusChangePatch(input: {
  note: PatchableNote;
  to: NoteStatus;
  actor: UserRef;
  at: string;
}): TransitionPatch | null {
  const decision = canTransitionTo(input.to, {
    ...lifecycleOf(input.note),
    now: input.at,
    actor: { id: input.actor.id, role: input.actor.role },
    source: "system",
  });

  return patchFrom(input.note, decision, input.actor, input.at);
}
