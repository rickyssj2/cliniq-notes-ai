import type { QueryClient } from "@tanstack/react-query";
import type { VersionConflictError } from "@soulside/domain";
import {
  fetchNoteDetail,
  fetchNoteVersion,
  notesQueryKeys,
  reconcileDetailTransition,
  saveNoteVersion,
  transitionNote,
  useConflictStore,
  useEditorDraftStore,
  type EditorDraft,
} from "@entities/note";
import { ApiError } from "@shared/api";
import { db } from "@shared/db";
import {
  mintCorrelationId,
  runWithCorrelationAsync,
} from "@shared/correlation";
import { log } from "@shared/logging";
import { pushNotice } from "@shared/notices";
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
 * Client errors that will not succeed on retry (lost claim races,
 * forbidden content, unknown actor, etc.). Version conflicts are excluded —
 * those need the merge UI and must stop the drain.
 */
function isTerminalClientError(
  err: unknown,
  itemType: "create_version" | "transition",
): err is ApiError {
  if (!(err instanceof ApiError)) return false;
  if (err.status < 400 || err.status >= 500) return false;
  if (
    itemType === "create_version" &&
    err.status === 409 &&
    isVersionConflict(err.body)
  ) {
    return false;
  }
  return true;
}

function restoreQueuedDraft(
  noteId: string,
  payload: CreateVersionPayload,
): EditorDraft {
  useEditorDraftStore.getState().applyResolution({
    noteId,
    baseVersionId: payload.baseVersionId,
    sections: payload.content.sections,
  });
  const draft = useEditorDraftStore.getState().drafts[noteId];
  return (
    draft ?? {
      noteId,
      baseVersionId: payload.baseVersionId,
      baseSections: { ...payload.content.sections },
      sections: { ...payload.content.sections },
      dirty: { S: true, O: true, A: true, P: true },
    }
  );
}

async function conflictFromServerTip(
  queryClient: QueryClient,
  noteId: string,
  payload: CreateVersionPayload,
): Promise<VersionConflictError> {
  const detail = await fetchNoteDetail(noteId);
  queryClient.setQueryData(notesQueryKeys.detail(noteId), detail);

  let ancestorContent = { sections: { ...payload.content.sections } };
  let ancestorRevision = Math.max(1, detail.currentVersion.revision - 1);
  const draft = useEditorDraftStore.getState().drafts[noteId];
  if (draft?.baseSections) {
    ancestorContent = { sections: { ...draft.baseSections } };
  }
  try {
    const ancestor = await fetchNoteVersion(noteId, payload.baseVersionId);
    ancestorContent = ancestor.content;
    ancestorRevision = ancestor.revision;
  } catch {
    // Base may no longer be fetchable; keep draft/payload fallback.
  }

  return {
    error: "version_conflict",
    current: {
      id: detail.currentVersion.id,
      revision: detail.currentVersion.revision,
      parentVersionId: detail.currentVersion.parentVersionId,
      authoredBy: detail.currentVersion.authoredBy,
      content: detail.currentVersion.content,
    },
    commonAncestor: {
      id: payload.baseVersionId,
      revision: ancestorRevision,
      parentVersionId: null,
      content: ancestorContent,
    },
  };
}

async function openOfflineSaveConflict(input: {
  queryClient: QueryClient;
  noteId: string;
  payload: CreateVersionPayload;
  conflict?: VersionConflictError;
}) {
  const yours = restoreQueuedDraft(input.noteId, input.payload);
  const conflict =
    input.conflict ??
    (await conflictFromServerTip(
      input.queryClient,
      input.noteId,
      input.payload,
    ));
  useConflictStore.getState().openConflict({
    noteId: input.noteId,
    conflict,
    yours,
    source: "offline_drain",
  });
  track(
    "note.conflict_opened",
    { noteId: input.noteId, source: "offline_drain" },
    { important: true },
  );
  pushNotice({
    kind: "warning",
    noteId: input.noteId,
    title: "Offline SOAP needs merge",
    body: `Rev ${conflict.current.revision} by ${conflict.current.authoredBy.displayName} landed while you were away. Resolve the merge modal to keep or discard your edits.`,
    ttlMs: 12_000,
  });
}

function transitionDiscardCopy(
  to: string,
  err: ApiError,
): { title: string; body: string } {
  const reason =
    typeof err.body === "object" &&
    err.body !== null &&
    "reason" in err.body &&
    typeof (err.body as { reason?: unknown }).reason === "string"
      ? (err.body as { reason: string }).reason
      : `HTTP ${err.status}`;
  if (to === "IN_REVIEW") {
    return {
      title: "Couldn’t start review offline",
      body: `Another clinician already claimed this note. Your queued claim was discarded. ${reason}`,
    };
  }
  return {
    title: "Queued action discarded",
    body: `Your offline transition to ${to} was rejected by the server. ${reason}`,
  };
}

/**
 * Ordered replay of Dexie mutation queue. Stops on network loss or conflict
 * (conflict opens the shared merge UI; remaining items stay queued).
 * Terminal transition 4xx are dropped with a toast; discarded SOAP opens
 * the same 3-way merge modal as version conflicts.
 */
export async function drainMutationQueue(
  queryClient: QueryClient,
): Promise<{ drained: number; stopped: "done" | "offline" | "conflict" }> {
  if (draining) return { drained: 0, stopped: "done" };
  if (!isEffectivelyOnline()) return { drained: 0, stopped: "offline" };

  draining = true;
  let drained = 0;
  let stopped: "done" | "offline" | "conflict" = "done";
  const correlationId = mintCorrelationId("drain");

  try {
    await runWithCorrelationAsync(correlationId, async () => {
      log.info("offline.drain.start");
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
            // Honest ack: advance base to the drained tip without clobbering
            // edits the user typed while the drain replay was running.
            useEditorDraftStore
              .getState()
              .acknowledgeSave(
                item.noteId,
                result.version.id,
                payload.content.sections,
              );
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
            reconcileDetailTransition(queryClient, {
              noteId: item.noteId,
              clientMutationId: item.clientMutationId,
              note: result.note,
              event: result.event,
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
            await openOfflineSaveConflict({
              queryClient,
              noteId: item.noteId,
              payload,
              conflict: err.body,
            });
            // Drop queue row — content lives in dirty draft + merge modal.
            await removeMutation(item.id);
            stopped = "conflict";
            break;
          }

          if (isTerminalClientError(err, item.type)) {
            track(
              "offline.mutation_discarded",
              {
                noteId: item.noteId,
                type: item.type,
                status: err.status,
              },
              { important: true },
            );

            if (item.type === "create_version") {
              const payload = item.payload as CreateVersionPayload;
              try {
                await openOfflineSaveConflict({
                  queryClient,
                  noteId: item.noteId,
                  payload,
                });
              } catch (openErr) {
                // Still surface something if detail fetch fails.
                pushNotice({
                  kind: "warning",
                  noteId: item.noteId,
                  title: "Offline SOAP discarded",
                  body:
                    openErr instanceof Error
                      ? openErr.message
                      : "Could not open merge UI for your queued edits.",
                  ttlMs: 12_000,
                });
                restoreQueuedDraft(item.noteId, payload);
              }
              await removeMutation(item.id);
              await queryClient.invalidateQueries({
                queryKey: notesQueryKeys.lists(),
              });
              stopped = "conflict";
              break;
            }

            const payload = item.payload as TransitionPayload;
            const copy = transitionDiscardCopy(payload.to, err);
            pushNotice({
              kind: "warning",
              noteId: item.noteId,
              title: copy.title,
              body: copy.body,
              ttlMs: 12_000,
            });
            await removeMutation(item.id);
            await queryClient.invalidateQueries({
              queryKey: notesQueryKeys.detail(item.noteId),
            });
            await queryClient.invalidateQueries({
              queryKey: notesQueryKeys.lists(),
            });
            continue;
          }

          const message =
            err instanceof ApiError
              ? `HTTP ${err.status}`
              : err instanceof Error
                ? err.message
                : "failed";
          await markFailed(item.id, message);
          await queryClient.invalidateQueries({
            queryKey: notesQueryKeys.detail(item.noteId),
          });
          await queryClient.invalidateQueries({
            queryKey: notesQueryKeys.lists(),
          });
        }
      }

      if (drained > 0 || stopped !== "done") {
        track(
          "offline.drain",
          { drained, stopped },
          { important: drained > 0 || stopped === "conflict" },
        );
      }
    });
  } finally {
    draining = false;
  }

  return { drained, stopped };
}
