import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { NoteDetail, VersionConflictError } from "@soulside/domain";
import { useQueryClient } from "@tanstack/react-query";
import {
  isDraftDirty,
  notesQueryKeys,
  saveNoteVersion,
  useEditorDraftStore,
  usePatchNoteInLists,
  type EditorDraft,
} from "@entities/note";
import { ApiError } from "@shared/api";
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
  onConflict: (conflict: VersionConflictError, yours: EditorDraft) => void;
}): AutosaveControllers {
  const { note, actorId, enabled, onConflict } = opts;
  const queryClient = useQueryClient();
  const patchList = usePatchNoteInLists();
  const markClean = useEditorDraftStore((s) => s.markClean);
  const draft = useEditorDraftStore((s) => s.drafts[note.id]);
  const [forceConflictNext, setForceConflictNext] = useState(false);

  const forceRef = useRef(false);
  const onConflictRef = useRef(onConflict);
  const noteRef = useRef(note);
  const actorIdRef = useRef(actorId);
  const patchListRef = useRef(patchList);
  const queryClientRef = useRef(queryClient);
  const markCleanRef = useRef(markClean);

  forceRef.current = forceConflictNext;
  onConflictRef.current = onConflict;
  noteRef.current = note;
  actorIdRef.current = actorId;
  patchListRef.current = patchList;
  queryClientRef.current = queryClient;
  markCleanRef.current = markClean;

  const saveImplRef = useRef<(clientMutationId: string) => Promise<{
    ok: true;
  } | { ok: false; kind: "conflict" | "error"; message: string }>>(async () => ({
    ok: true,
  }));

  saveImplRef.current = async (clientMutationId) => {
    const n = noteRef.current;
    const d = useEditorDraftStore.getState().drafts[n.id];
    if (!d || !isDraftDirty(d)) return { ok: true };

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

    try {
      const headers: Record<string, string> = {};
      if (forceRef.current) {
        headers["X-Force-Conflict"] = "1";
        forceRef.current = false;
        setForceConflictNext(false);
      }

      const result = await saveNoteVersion({
        noteId: n.id,
        baseVersionId: d.baseVersionId,
        content: { sections: d.sections },
        clientMutationId,
        actorId: actorIdRef.current,
        headers,
      });

      markCleanRef.current(n.id, result.version.id);
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
      return { ok: true };
    } catch (err) {
      if (snapshot) {
        qc.setQueryData(detailKey, snapshot);
      }
      await qc.invalidateQueries({ queryKey: notesQueryKeys.lists() });

      if (
        err instanceof ApiError &&
        err.status === 409 &&
        isVersionConflict(err.body)
      ) {
        onConflictRef.current(err.body, d);
        return { ok: false, kind: "conflict", message: "Version conflict" };
      }
      const message =
        err instanceof ApiError
          ? `Save failed (${err.status}): ${JSON.stringify(err.body)}`
          : err instanceof Error
            ? err.message
            : "Save failed";
      return { ok: false, kind: "error", message };
    }
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
