import type { QueryClient } from "@tanstack/react-query";
import type { NoteDetail, NoteSummary, VersionConflictError } from "@soulside/domain";
import { applyServerStatusChange } from "@soulside/domain";
import type { RealtimeEvent } from "@shared/realtime";
import { notesQueryKeys } from "../api/query-keys";
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

function patchNoteInLists(queryClient: QueryClient, patch: Partial<NoteSummary> & { id: string }) {
  queryClient.setQueriesData<
    { pages: Array<{ items: NoteSummary[] }>; pageParams: unknown[] } | undefined
  >({ queryKey: notesQueryKeys.lists() }, (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.map((item) =>
          item.id === patch.id ? { ...item, ...patch } : item,
        ),
      })),
    };
  });
}

/**
 * Apply a WS event to Query + presence + conflict stores.
 * Returns false if the event was a duplicate (already seen).
 */
export function applyRealtimeEvent(
  queryClient: QueryClient,
  event: RealtimeEvent,
): boolean {
  if (!rememberEventId(event.eventId)) return false;

  switch (event.type) {
    case "note.presence": {
      usePresenceStore.getState().setViewers(event.noteId, event.viewers);
      return true;
    }
    case "note.status_changed": {
      const detailKey = notesQueryKeys.detail(event.noteId);
      const detail = queryClient.getQueryData<NoteDetail>(detailKey);

      if (detail) {
        if (detail.status === event.toStatus) {
          // Already applied (optimistic ack) — still refresh updatedAt lightly.
          queryClient.setQueryData<NoteDetail>(detailKey, {
            ...detail,
            updatedAt: event.at,
          });
        } else {
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
      return true;
    }
    case "note.version_added": {
      const draft = useEditorDraftStore.getState().drafts[event.noteId];
      const dirty = isDraftDirty(draft);

      if (
        dirty &&
        draft &&
        draft.baseVersionId !== event.version.id &&
        !useConflictStore.getState().open
      ) {
        // Skip echo of our own successful save (arrives before markClean).
        const isOwnEcho =
          event.version.parentVersionId === draft.baseVersionId &&
          JSON.stringify(event.version.content.sections) ===
            JSON.stringify(draft.sections);
        if (!isOwnEcho) {
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
        }
      }

      const detailKey = notesQueryKeys.detail(event.noteId);
      const detail = queryClient.getQueryData<NoteDetail>(detailKey);
      if (detail && !dirty) {
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
      } else if (detail && dirty) {
        // Keep showing local draft; still bump meta so UI knows server moved.
        queryClient.setQueryData<NoteDetail>(detailKey, {
          ...detail,
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
      return true;
    }
    default:
      return true;
  }
}
