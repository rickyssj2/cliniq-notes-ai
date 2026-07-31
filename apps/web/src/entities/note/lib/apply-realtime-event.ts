import type { QueryClient } from "@tanstack/react-query";
import type { NoteDetail, NoteSummary, VersionConflictError } from "@soulside/domain";
import { applyServerStatusChange } from "@soulside/domain";
import { getActorId } from "@shared/api";
import { log } from "@shared/logging";
import { pushNotice } from "@shared/notices";
import type { RealtimeEvent } from "@shared/realtime";
import { clearPendingGeneration } from "@shared/realtime";
import { notesQueryKeys, type NotesFilterState } from "../api/query-keys";
import { noteMatchesListFilters } from "./note-matches-list-filters";
import {
  mergeReviewEvent,
  reviewEventFromStatusChanged,
} from "./optimistic-transition";
import {
  isDraftDirty,
  useEditorDraftStore,
} from "../model/editor-draft-store";
import { useConflictStore } from "../model/conflict-store";
import { usePresenceStore } from "../model/presence-store";

const seenEventIds = new Set<string>();
const SEEN_CAP = 2_000;

function rememberEventId(eventId: string): boolean {
  if (seenEventIds.has(eventId)) return false;
  seenEventIds.add(eventId);
  if (seenEventIds.size > SEEN_CAP) {
    const first = seenEventIds.values().next().value;
    if (first) seenEventIds.delete(first);
  }
  return true;
}

function patchNoteInLists(
  queryClient: QueryClient,
  patch: Partial<NoteSummary> & { id: string },
) {
  const queries = queryClient.getQueriesData<{
    pages: Array<{ items: NoteSummary[] }>;
    pageParams: unknown[];
  }>({ queryKey: notesQueryKeys.lists() });

  const listsToInvalidate: unknown[][] = [];

  for (const [queryKey, old] of queries) {
    if (!old) continue;
    const params = queryKey[2] as NotesFilterState | undefined;
    let found = false;

    const pages = old.pages.map((page) => ({
      ...page,
      items: page.items.flatMap((item) => {
        if (item.id !== patch.id) return [item];
        found = true;
        const next = { ...item, ...patch };
        if (params && !noteMatchesListFilters(next, params)) return [];
        return [next];
      }),
    }));

    if (found) {
      queryClient.setQueryData(queryKey, { ...old, pages });
      continue;
    }

    // Note isn't in this cached page set (e.g. left FAILED filter while
    // GENERATING). If the new status would match this list, refetch it.
    if (
      patch.status &&
      (!params ||
        params.statuses.length === 0 ||
        params.statuses.includes(patch.status))
    ) {
      listsToInvalidate.push(queryKey as unknown[]);
    }
  }

  for (const queryKey of listsToInvalidate) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

function isSelfActor(actorId: string): boolean {
  const self = getActorId();
  return Boolean(self && self === actorId);
}

/**
 * Apply a WS event to Query + presence + conflict stores.
 * Returns false if the event was a duplicate (already seen).
 */
export function applyRealtimeEvent(
  queryClient: QueryClient,
  event: RealtimeEvent,
): boolean {
  if (!rememberEventId(event.eventId)) {
    // Server marks intentional demo rebroadcasts (`demoDuplicate`) so every
    // subscribed tab toasts — subscribe/replay dedupe stays silent.
    if (import.meta.env.DEV && event.demoDuplicate) {
      pushNotice({
        kind: "info",
        noteId: "noteId" in event ? event.noteId : undefined,
        title: "WS duplicate dropped",
        body: `eventId ${event.eventId} already applied — at-least-once dedupe (no second patch).`,
        ttlMs: 6_000,
      });
    }
    return false;
  }

  if (event.correlationId) {
    log.info("realtime.echo", {
      type: event.type,
      noteId: event.noteId,
      eventId: event.eventId,
      correlationId: event.correlationId,
    });
  }

  switch (event.type) {
    case "note.presence": {
      usePresenceStore.getState().setViewers(event.noteId, event.viewers);
      return true;
    }
    case "note.status_changed": {
      if (event.toStatus !== "GENERATING") {
        clearPendingGeneration(event.noteId);
      }

      const detailKey = notesQueryKeys.detail(event.noteId);
      const detail = queryClient.getQueryData<NoteDetail>(detailKey);
      let statusActuallyChanged = false;

      if (detail) {
        const serverReviewEvent = reviewEventFromStatusChanged({
          eventId: event.eventId,
          noteId: event.noteId,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          actor: event.actor,
          at: event.at,
          versionId: detail.currentVersion.id,
        });

        if (detail.status === event.toStatus) {
          // Already applied (optimistic ack) — refresh timestamp + reconcile event.
          queryClient.setQueryData<NoteDetail>(detailKey, {
            ...detail,
            updatedAt: event.at,
            review: {
              events: mergeReviewEvent(
                detail.review.events,
                serverReviewEvent,
              ),
            },
          });
        } else {
          statusActuallyChanged = true;
          const machine = applyServerStatusChange({
            status: detail.status,
            to: event.toStatus,
            actor: {
              id: event.actor.id,
              role: event.actor.role,
            },
            assignedReviewerId: detail.assignedReviewer?.id ?? null,
            approvedAt: detail.approvedAt,
            now: event.at,
          });
          if (machine.ok) {
            queryClient.setQueryData<NoteDetail>(detailKey, {
              ...detail,
              status: event.toStatus,
              updatedAt: event.at,
              approvedAt:
                event.toStatus === "APPROVED"
                  ? event.at
                  : detail.approvedAt,
              assignedReviewer:
                event.toStatus === "IN_REVIEW"
                  ? detail.assignedReviewer ?? event.actor
                  : event.toStatus === "READY_FOR_REVIEW"
                    ? null
                    : detail.assignedReviewer,
              review: {
                events: mergeReviewEvent(
                  detail.review.events,
                  serverReviewEvent,
                ),
              },
            });
          } else {
            void queryClient.invalidateQueries({ queryKey: detailKey });
          }
        }
      }

      patchNoteInLists(queryClient, {
        id: event.noteId,
        status: event.toStatus,
        updatedAt: event.at,
      });

      // Notify when viewing a note and someone else changed lifecycle status.
      if (
        detail &&
        statusActuallyChanged &&
        !isSelfActor(event.actor.id)
      ) {
        pushNotice({
          kind: "info",
          noteId: event.noteId,
          title: `Status → ${event.toStatus}`,
          body: `${event.actor.displayName} updated this note.`,
        });
      }
      return true;
    }
    case "note.version_added": {
      const detailKey = notesQueryKeys.detail(event.noteId);
      const detail = queryClient.getQueryData<NoteDetail>(detailKey);

      // Stale echo guard: a slow save's WS event can land after a follow-up
      // save already advanced the tip. Never regress cache/draft to it.
      if (
        detail &&
        event.version.id !== detail.currentVersion.id &&
        event.version.revision <= detail.currentVersion.revision
      ) {
        return true;
      }

      const draft = useEditorDraftStore.getState().drafts[event.noteId];

      // Own save echo. Content equality is deliberately NOT required — the
      // user may have typed more while the slow POST was in flight; that
      // typed-ahead text must not be mistaken for a foreign conflict.
      const alreadyAcked =
        Boolean(draft) && draft!.baseVersionId === event.version.id;
      const parentsOurBase =
        Boolean(draft) &&
        event.version.parentVersionId === draft!.baseVersionId;
      const isOwnEcho =
        alreadyAcked ||
        (parentsOurBase &&
          (isSelfActor(event.version.authoredBy.id) ||
            JSON.stringify(event.version.content.sections) ===
              JSON.stringify(draft!.sections)));

      let openedConflict = false;

      if (isOwnEcho) {
        if (!alreadyAcked) {
          // WS beat the HTTP ack — advance base, keep typed-ahead edits dirty.
          useEditorDraftStore
            .getState()
            .acknowledgeSave(
              event.noteId,
              event.version.id,
              event.version.content.sections,
            );
        }
      } else if (
        draft &&
        isDraftDirty(draft) &&
        !useConflictStore.getState().open
      ) {
        const conflict: VersionConflictError = {
          error: "version_conflict",
          current: {
            id: event.version.id,
            revision: event.version.revision,
            parentVersionId: event.version.parentVersionId,
            authoredBy: event.version.authoredBy,
            content: event.version.content,
          },
          commonAncestor: {
            id: draft.baseVersionId,
            revision: Math.max(1, event.version.revision - 1),
            parentVersionId: null,
            content: { sections: { ...draft.baseSections } },
          },
        };
        useConflictStore.getState().openConflict({
          noteId: event.noteId,
          conflict,
          yours: draft,
          source: "realtime",
        });
        openedConflict = true;
      }

      const dirtyAfter = isDraftDirty(
        useEditorDraftStore.getState().drafts[event.noteId],
      );
      const tipChanged =
        Boolean(detail) && detail!.currentVersion.id !== event.version.id;

      if (detail && openedConflict) {
        // Keep showing local draft; still bump meta so UI knows server moved.
        queryClient.setQueryData<NoteDetail>(detailKey, {
          ...detail,
          updatedAt: event.at,
        });
      } else if (detail) {
        // Own echo or foreign clean tip: cache follows the server. The draft
        // store guards unsaved edits (hydrate never replaces a dirty draft).
        queryClient.setQueryData<NoteDetail>(detailKey, {
          ...detail,
          currentVersion: {
            ...detail.currentVersion,
            id: event.version.id,
            revision: event.version.revision,
            parentVersionId: event.version.parentVersionId,
            content: event.version.content,
            authoredBy: event.version.authoredBy,
          },
          updatedAt: event.at,
        });
      } else {
        void queryClient.invalidateQueries({ queryKey: detailKey });
      }

      patchNoteInLists(queryClient, {
        id: event.noteId,
        currentVersion: {
          id: event.version.id,
          revision: event.version.revision,
          parentVersionId: event.version.parentVersionId,
        },
        updatedAt: event.at,
      });

      // Silent hydrate path: clean draft + foreign tip — surface a toast so
      // reviewer/admin concurrent saves are never invisible.
      if (
        detail &&
        !dirtyAfter &&
        !openedConflict &&
        !isOwnEcho &&
        tipChanged &&
        !isSelfActor(event.version.authoredBy.id)
      ) {
        pushNotice({
          kind: "info",
          noteId: event.noteId,
          title: `SOAP updated · rev ${event.version.revision}`,
          body: `${event.version.authoredBy.displayName} saved while you were viewing this note. Your editor now shows their content.`,
        });
      }
      return true;
    }
    default:
      return true;
  }
}
