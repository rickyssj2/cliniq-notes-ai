import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { NoteDetail, VersionConflictError } from "@soulside/domain";
import { useQueryClient } from "@tanstack/react-query";
import {
  isDraftDirty,
  notesQueryKeys,
  saveNoteVersion,
  useConflictStore,
  useEditorDraftStore,
  usePatchNoteInLists,
  type EditorDraft,
} from "@entities/note";
import { ApiError } from "@shared/api";
import {
  mintCorrelationId,
  runWithCorrelationAsync,
} from "@shared/correlation";
import { log } from "@shared/logging";
import { track } from "@shared/telemetry";
import {
  enqueueCreateVersion,
  isEffectivelyOnline,
} from "@features/offline-queue";
import {
  createCoalescedSaver,
  type CoalescedSaveStatus,
} from "./coalesced-saver";

const AUTOSAVE_MS = 800;

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

export type AutosaveControllers = {
  status: CoalescedSaveStatus;
  lastError: string | null;
  saveNow: () => Promise<void>;
  forceConflictNext: boolean;
  setForceConflictNext: (v: boolean) => void;
};

export function useCoalescedAutosave(opts: {
  note: NoteDetail;
  actorId: string;
  enabled: boolean;
  onConflict?: (conflict: VersionConflictError, yours: EditorDraft) => void;
}): AutosaveControllers {
  const { note, actorId, enabled, onConflict } = opts;
  const queryClient = useQueryClient();
  const patchList = usePatchNoteInLists();
  const markClean = useEditorDraftStore((s) => s.markClean);
  const acknowledgeSave = useEditorDraftStore((s) => s.acknowledgeSave);
  const draft = useEditorDraftStore((s) => s.drafts[note.id]);
  const [forceConflictNext, setForceConflictNext] = useState(false);

  const forceRef = useRef(false);
  const onConflictRef = useRef(onConflict);
  const noteRef = useRef(note);
  const actorIdRef = useRef(actorId);
  const patchListRef = useRef(patchList);
  const queryClientRef = useRef(queryClient);
  const markCleanRef = useRef(markClean);
  const acknowledgeSaveRef = useRef(acknowledgeSave);

  forceRef.current = forceConflictNext;
  onConflictRef.current = onConflict;
  noteRef.current = note;
  actorIdRef.current = actorId;
  patchListRef.current = patchList;
  queryClientRef.current = queryClient;
  markCleanRef.current = markClean;
  acknowledgeSaveRef.current = acknowledgeSave;

  const saveImplRef = useRef<(clientMutationId: string) => Promise<{
    ok: true;
  } | { ok: false; kind: "conflict" | "error"; message: string }>>(async () => ({
    ok: true,
  }));

  saveImplRef.current = async (clientMutationId) => {
    const correlationId = mintCorrelationId("save");
    return runWithCorrelationAsync(correlationId, async () => {
      const n = noteRef.current;
      const d = useEditorDraftStore.getState().drafts[n.id];
      if (!d || !isDraftDirty(d)) return { ok: true as const };

      log.info("autosave.start", {
        noteId: n.id,
        clientMutationId,
      });

      const qc = queryClientRef.current;
      const detailKey = notesQueryKeys.detail(n.id);
      const snapshot = qc.getQueryData<NoteDetail>(detailKey);

      if (snapshot) {
        qc.setQueryData<NoteDetail>(detailKey, {
          ...snapshot,
          currentVersion: {
            ...snapshot.currentVersion,
            content: { sections: { ...d.sections } },
          },
          updatedAt: new Date().toISOString(),
        });
      }
      patchListRef.current({
        ...n,
        updatedAt: new Date().toISOString(),
      });

      const queueLocally = async () => {
        await enqueueCreateVersion({
          noteId: n.id,
          clientMutationId,
          baseVersionId: d.baseVersionId,
          content: { sections: d.sections },
          actorId: actorIdRef.current,
        });
        // Keep baseVersionId until drain acks — draft looks clean, intent is in Dexie.
        markCleanRef.current(n.id, d.baseVersionId);
        track(
          "note.autosave_queued",
          { noteId: n.id, reason: "offline_or_network" },
          { important: true },
        );
        return { ok: true as const };
      };

      if (!isEffectivelyOnline()) {
        return queueLocally();
      }

      try {
        const headers: Record<string, string> = {};
        if (forceRef.current) {
          headers["X-Force-Conflict"] = "1";
          forceRef.current = false;
          setForceConflictNext(false);
        }

        // Freeze the payload — the user may keep typing while the POST is slow.
        const savedSections = { ...d.sections };

        const result = await saveNoteVersion({
          noteId: n.id,
          baseVersionId: d.baseVersionId,
          content: { sections: savedSections },
          clientMutationId,
          actorId: actorIdRef.current,
          headers,
        });

        // Advance base to the acked tip; typed-ahead edits stay dirty and
        // trigger a follow-up save — never wiped by markClean/hydrate.
        acknowledgeSaveRef.current(n.id, result.version.id, savedSections);
        await qc.invalidateQueries({ queryKey: detailKey });
        patchListRef.current({
          ...n,
          currentVersion: {
            id: result.version.id,
            revision: result.version.revision,
            parentVersionId: result.version.parentVersionId,
          },
          updatedAt: new Date().toISOString(),
        });
        track("note.autosave", {
          noteId: n.id,
          revision: result.version.revision,
        });
        return { ok: true as const };
      } catch (err) {
        if (isNetworkFailure(err)) {
          return queueLocally();
        }

        if (snapshot) {
          qc.setQueryData(detailKey, snapshot);
        }
        await qc.invalidateQueries({ queryKey: notesQueryKeys.lists() });

        if (
          err instanceof ApiError &&
          err.status === 409 &&
          isVersionConflict(err.body)
        ) {
          useConflictStore.getState().openConflict({
            noteId: n.id,
            conflict: err.body,
            yours: d,
            source: "save",
          });
          track(
            "note.conflict_opened",
            { noteId: n.id, source: "autosave" },
            { important: true },
          );
          onConflictRef.current?.(err.body, d);
          return { ok: false as const, kind: "conflict" as const, message: "Version conflict" };
        }
        const message =
          err instanceof ApiError
            ? `Save failed (${err.status}): ${JSON.stringify(err.body)}`
            : err instanceof Error
              ? err.message
              : "Save failed";
        track(
          "note.autosave_error",
          {
            noteId: n.id,
            status: err instanceof ApiError ? err.status : 0,
          },
          { important: true },
        );
        return { ok: false as const, kind: "error" as const, message };
      }
    });
  };

  const saver = useMemo(
    () =>
      createCoalescedSaver({
        debounceMs: AUTOSAVE_MS,
        mintMutationId: () => `save_${note.id}_${crypto.randomUUID()}`,
        save: (id) => saveImplRef.current(id),
      }),
    [note.id],
  );

  const status = useSyncExternalStore(
    saver.subscribe,
    saver.getStatus,
    saver.getStatus,
  );
  const lastError = useSyncExternalStore(
    saver.subscribe,
    saver.getLastError,
    saver.getLastError,
  );

  const fingerprint = draft
    ? `${draft.baseVersionId}:${JSON.stringify(draft.sections)}`
    : "";
  const dirty = isDraftDirty(draft);

  useEffect(() => {
    if (!enabled || !dirty) return;
    saver.schedule();
    return () => saver.cancel();
  }, [enabled, dirty, fingerprint, saver]);

  useEffect(() => {
    return () => saver.cancel();
  }, [saver]);

  return {
    status,
    lastError,
    saveNow: () => saver.flushNow(),
    forceConflictNext,
    setForceConflictNext,
  };
}

export type { CoalescedSaveStatus };
