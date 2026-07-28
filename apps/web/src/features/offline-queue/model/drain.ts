import type { QueryClient } from "@tanstack/react-query";
import type { NoteDetail, VersionConflictError } from "@soulside/domain";
import {
  notesQueryKeys,
  saveNoteVersion,
  transitionNote,
  useConflictStore,
  useEditorDraftStore,
} from "@entities/note";
import { ApiError } from "@shared/api";
import { db } from "@shared/db";
import { track } from "@shared/telemetry";
import { isEffectivelyOnline } from "./connectivity-store";
import {
  listDrainable,
  markFailed,
  markInFlight,
  removeMutation,
  touchQueueStats,
  type CreateVersionPayload,
  type TransitionPayload,
} from "./mutation-queue";

let draining = false;

function isVersionConflict(body: unknown): body is VersionConflictError {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as VersionConflictError).error === "version_conflict"
  );
}

function isNetworkFailure(err: unknown): boolean {
  if (!isEffectivelyOnline()) return true;
  if (err instanceof ApiError && err.status === 0) return true;
  if (err instanceof TypeError) return true;
  return false;
}

/**
 * Ordered replay of Dexie mutation queue. Stops on network loss or conflict
 * (conflict opens the shared merge UI; remaining items stay queued).
 */
export async function drainMutationQueue(
  queryClient: QueryClient,
): Promise<{ drained: number; stopped: "done" | "offline" | "conflict" }> {
  if (draining) return { drained: 0, stopped: "done" };
  if (!isEffectivelyOnline()) return { drained: 0, stopped: "offline" };

  draining = true;
  let drained = 0;
  let stopped: "done" | "offline" | "conflict" = "done";

  try {
    const items = await listDrainable();
    for (const item of items) {
      if (!isEffectivelyOnline()) {
        stopped = "offline";
        break;
      }
      if (item.id == null) continue;

      await markInFlight(item.id);

      try {
        if (item.type === "create_version") {
          const payload = item.payload as CreateVersionPayload;
          const result = await saveNoteVersion({
            noteId: item.noteId,
            baseVersionId: payload.baseVersionId,
            content: payload.content,
            clientMutationId: item.clientMutationId,
            actorId: payload.actorId,
          });
          useEditorDraftStore
            .getState()
            .markClean(item.noteId, result.version.id);
          await queryClient.invalidateQueries({
            queryKey: notesQueryKeys.detail(item.noteId),
          });
          await queryClient.invalidateQueries({
            queryKey: notesQueryKeys.lists(),
          });
        } else {
          const payload = item.payload as TransitionPayload;
          const result = await transitionNote({
            noteId: item.noteId,
            to: payload.to,
            actorId: payload.actorId,
            reason: payload.reason,
            mfaVerified: payload.mfaVerified,
            clientMutationId: item.clientMutationId,
          });
          queryClient.setQueryData<NoteDetail>(
            notesQueryKeys.detail(item.noteId),
            (old) => {
              if (!old) return old;
              return {
                ...old,
                status: result.note.status,
                assignedReviewer: result.note.assignedReviewer,
                approvedAt: result.note.approvedAt,
                updatedAt: result.note.updatedAt,
                currentVersion: {
                  ...old.currentVersion,
                  ...result.note.currentVersion,
                },
              };
            },
          );
          await queryClient.invalidateQueries({
            queryKey: notesQueryKeys.detail(item.noteId),
          });
          await queryClient.invalidateQueries({
            queryKey: notesQueryKeys.lists(),
          });
        }

        await removeMutation(item.id);
        drained += 1;
        track("offline.mutation_acked", {
          noteId: item.noteId,
          type: item.type,
        });
      } catch (err) {
        if (isNetworkFailure(err)) {
          await db.mutationQueue.update(item.id, {
            status: "pending",
            lastError: err instanceof Error ? err.message : "network",
          });
          touchQueueStats();
          stopped = "offline";
          break;
        }

        if (
          err instanceof ApiError &&
          err.status === 409 &&
          item.type === "create_version" &&
          isVersionConflict(err.body)
        ) {
          const payload = item.payload as CreateVersionPayload;
          const draft = useEditorDraftStore.getState().drafts[item.noteId];
          useConflictStore.getState().openConflict({
            noteId: item.noteId,
            conflict: err.body,
            yours: draft ?? {
              noteId: item.noteId,
              baseVersionId: payload.baseVersionId,
              baseSections: { ...payload.content.sections },
              sections: { ...payload.content.sections },
              dirty: { S: true, O: true, A: true, P: true },
            },
            source: "save",
          });
          track(
            "note.conflict_opened",
            { noteId: item.noteId, source: "offline_drain" },
            { important: true },
          );
          await markFailed(item.id, "version_conflict");
          stopped = "conflict";
          break;
        }

        const message =
          err instanceof ApiError
            ? `HTTP ${err.status}`
            : err instanceof Error
              ? err.message
              : "failed";
        await markFailed(item.id, message);
        // Roll back optimistic detail/list if the server rejected the replay.
        await queryClient.invalidateQueries({
          queryKey: notesQueryKeys.detail(item.noteId),
        });
        await queryClient.invalidateQueries({
          queryKey: notesQueryKeys.lists(),
        });
      }
    }
  } finally {
    draining = false;
    if (drained > 0 || stopped !== "done") {
      track(
        "offline.drain",
        { drained, stopped },
        { important: drained > 0 || stopped === "conflict" },
      );
    }
  }

  return { drained, stopped };
}
