import { useQueryClient } from "@tanstack/react-query";
import type { SoapSection } from "@soulside/domain";
import {
  notesQueryKeys,
  saveNoteVersion,
  useConflictStore,
  useEditorDraftStore,
} from "@entities/note";
import { useActor } from "@entities/user";
import { useAutosavePreferenceStore } from "@shared/prefs";
import {
  mintCorrelationId,
  runWithCorrelationAsync,
} from "@shared/correlation";
import { log } from "@shared/logging";
import { track } from "@shared/telemetry";
import { ConflictMergeModal } from "./ConflictMergeModal";

/** App-shell host so save + realtime conflicts both surface the same merge UI. */
export function ConflictMergeHost() {
  const payload = useConflictStore((s) => s.open);
  const closeConflict = useConflictStore((s) => s.closeConflict);
  const setAutosaveOn = useAutosavePreferenceStore((s) => s.setEnabled);
  const applyResolution = useEditorDraftStore((s) => s.applyResolution);
  const acknowledgeSave = useEditorDraftStore((s) => s.acknowledgeSave);
  const actor = useActor();
  const queryClient = useQueryClient();

  if (!payload) return null;

  const onKeepEditing = () => {
    // Pause autosave so a dirty draft does not immediately re-POST and reopen the modal.
    setAutosaveOn(false);
    closeConflict();
  };

  const onResolve = async (
    sections: Record<SoapSection, string>,
    baseVersionId: string,
  ) => {
    const correlationId = mintCorrelationId("merge");
    await runWithCorrelationAsync(correlationId, async () => {
      log.info("conflict.resolve.start", { noteId: payload.noteId });
      applyResolution({
        noteId: payload.noteId,
        baseVersionId,
        sections,
      });
      closeConflict();
      try {
        const result = await saveNoteVersion({
          noteId: payload.noteId,
          baseVersionId,
          content: { sections },
          clientMutationId: `merge_${payload.noteId}_${crypto.randomUUID()}`,
          actorId: actor.id,
        });
        // Honest ack: keep any edits typed while the resolve POST was in flight.
        acknowledgeSave(payload.noteId, result.version.id, sections);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: notesQueryKeys.detail(payload.noteId),
          }),
          queryClient.invalidateQueries({
            queryKey: notesQueryKeys.lists(),
          }),
        ]);
        track(
          "note.conflict_resolved",
          { noteId: payload.noteId, revision: result.version.revision },
          { important: true },
        );
      } catch {
        track(
          "note.conflict_resolve_failed",
          { noteId: payload.noteId },
          { important: true },
        );
        // Draft stays dirty; user can retry from editor.
      }
    });
  };

  return (
    <ConflictMergeModal
      conflict={payload.conflict}
      yours={payload.yours}
      source={payload.source}
      onCancel={onKeepEditing}
      onResolve={(sections, baseVersionId) => {
        void onResolve(sections, baseVersionId);
      }}
    />
  );
}
