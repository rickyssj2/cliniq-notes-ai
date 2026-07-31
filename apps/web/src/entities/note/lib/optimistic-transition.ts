import type { QueryClient } from "@tanstack/react-query";
import type {
  NoteAction,
  NoteDetail,
  NoteStatus,
  NoteSummary,
  ReviewEvent,
  UserRef,
  VersionRef,
} from "@soulside/domain";
import { notesQueryKeys } from "../api/query-keys";

export function localReviewEventId(clientMutationId: string): string {
  return `local_${clientMutationId}`;
}

export function isLocalReviewEventId(id: string): boolean {
  return id.startsWith("local_");
}

/** Upsert a server ReviewEvent; replace matching local_* optimistic rows. */
export function mergeReviewEvent(
  events: ReviewEvent[],
  serverEvent: ReviewEvent,
): ReviewEvent[] {
  const matchesLocal = (e: ReviewEvent) =>
    isLocalReviewEventId(e.id) &&
    e.fromStatus === serverEvent.fromStatus &&
    e.toStatus === serverEvent.toStatus &&
    e.actorId === serverEvent.actorId;

  if (events.some((e) => e.id === serverEvent.id)) {
    return events.filter((e) => e.id === serverEvent.id || !matchesLocal(e));
  }

  const localIdx = events.findIndex(matchesLocal);
  if (localIdx >= 0) {
    const next = events.slice();
    next[localIdx] = serverEvent;
    return next;
  }

  return [...events, serverEvent];
}

export function reconcileLocalReviewEvent(
  events: ReviewEvent[],
  clientMutationId: string,
  serverEvent: ReviewEvent,
): ReviewEvent[] {
  const localId = localReviewEventId(clientMutationId);
  if (events.some((e) => e.id === serverEvent.id)) {
    return events.filter((e) => e.id !== localId);
  }
  const idx = events.findIndex((e) => e.id === localId);
  if (idx >= 0) {
    const next = events.slice();
    next[idx] = serverEvent;
    return next;
  }
  return [...events, serverEvent];
}

export function buildLocalReviewEvent(input: {
  noteId: string;
  versionId: string | null;
  fromStatus: NoteStatus | null;
  toStatus: NoteStatus;
  actor: UserRef;
  reason?: string;
  clientMutationId: string;
  occurredAt: string;
}): ReviewEvent {
  return {
    id: localReviewEventId(input.clientMutationId),
    noteId: input.noteId,
    versionId: input.versionId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    reason: input.reason,
    occurredAt: input.occurredAt,
  };
}

export type OptimisticTransitionInput = {
  note: NoteDetail;
  to: NoteStatus;
  action: NoteAction;
  actor: UserRef;
  reason?: string;
  clientMutationId: string;
  at?: string;
};

function nextAssignee(
  note: NoteDetail,
  action: NoteAction,
  actor: UserRef,
): NoteDetail["assignedReviewer"] {
  if (action === "start_review") return actor;
  if (action === "return" || action === "approve" || action === "reject") {
    return null;
  }
  return note.assignedReviewer;
}

/** Apply status + local ReviewEvent to detail cache. Returns prior snapshot. */
export function applyOptimisticDetailTransition(
  queryClient: QueryClient,
  input: OptimisticTransitionInput,
): NoteDetail | undefined {
  const detailKey = notesQueryKeys.detail(input.note.id);
  const snapshot = queryClient.getQueryData<NoteDetail>(detailKey);
  const at = input.at ?? new Date().toISOString();
  const fromStatus = input.note.status;
  const assignedReviewer = nextAssignee(input.note, input.action, input.actor);
  const approvedAt =
    input.action === "approve" ? at : input.note.approvedAt;
  const localEvent = buildLocalReviewEvent({
    noteId: input.note.id,
    versionId: input.note.currentVersion.id,
    fromStatus,
    toStatus: input.to,
    actor: input.actor,
    reason: input.reason,
    clientMutationId: input.clientMutationId,
    occurredAt: at,
  });

  queryClient.setQueryData<NoteDetail>(detailKey, (old) => {
    const base = old ?? input.note;
    const withoutDupLocal = base.review.events.filter(
      (e) => e.id !== localEvent.id,
    );
    return {
      ...base,
      status: input.to,
      assignedReviewer,
      approvedAt,
      updatedAt: at,
      review: { events: [...withoutDupLocal, localEvent] },
    };
  });

  return snapshot ?? structuredClone(input.note);
}

export function reconcileDetailTransition(
  queryClient: QueryClient,
  input: {
    noteId: string;
    clientMutationId: string;
    note: Pick<
      NoteSummary,
      "status" | "assignedReviewer" | "approvedAt" | "updatedAt"
    > & { currentVersion?: VersionRef };
    event: ReviewEvent;
  },
) {
  const detailKey = notesQueryKeys.detail(input.noteId);
  queryClient.setQueryData<NoteDetail>(detailKey, (old) => {
    if (!old) return old;
    return {
      ...old,
      status: input.note.status,
      assignedReviewer: input.note.assignedReviewer,
      approvedAt: input.note.approvedAt,
      updatedAt: input.note.updatedAt,
      currentVersion: input.note.currentVersion
        ? { ...old.currentVersion, ...input.note.currentVersion }
        : old.currentVersion,
      review: {
        events: reconcileLocalReviewEvent(
          old.review.events,
          input.clientMutationId,
          input.event,
        ),
      },
    };
  });
}

export function rollbackDetailTransition(
  queryClient: QueryClient,
  noteId: string,
  snapshot: NoteDetail,
) {
  queryClient.setQueryData(notesQueryKeys.detail(noteId), snapshot);
}

/** Build a ReviewEvent from a WS status_changed payload. */
export function reviewEventFromStatusChanged(input: {
  eventId: string;
  noteId: string;
  fromStatus: NoteStatus;
  toStatus: NoteStatus;
  actor: UserRef;
  at: string;
  versionId: string | null;
}): ReviewEvent {
  return {
    id: input.eventId,
    noteId: input.noteId,
    versionId: input.versionId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    occurredAt: input.at,
  };
}
