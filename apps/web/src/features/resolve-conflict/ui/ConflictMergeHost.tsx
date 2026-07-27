import { useQueryClient } from "@tanstack/react-query";
import type { SoapSection } from "@soulside/domain";
import {
  notesQueryKeys,
  saveNoteVersion,
  useConflictStore,
  useEditorDraftStore,
} from "@entities/note";
import { useActor } from "@entities/user";
import { ConflictMergeModal } from "./ConflictMergeModal";

/** App-shell host so save + realtime conflicts both surface the same merge UI. */
export function ConflictMergeHost() {
  const payload = useConflictStore((s) => s.open);
  const closeConflict = useConflictStore((s) => s.closeConflict);
  const applyResolution = useEditorDraftStore((s) => s.applyResolution);
  const markClean = useEditorDraftStore((s) => s.markClean);
  const actor = useActor();
  const queryClient = useQueryClient();

  if (!payload) return null;

  const onResolve = async (
    sections: Record<SoapSection, string>,
    baseVersionId: string,
  ) => {
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
      markClean(payload.noteId, result.version.id);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: notesQueryKeys.detail(payload.noteId),
        }),
        queryClient.invalidateQueries({
          queryKey: notesQueryKeys.lists(),
        }),
      ]);
    } catch {
      // Draft stays dirty; user can retry from editor.
    }
  };

  return (
    <ConflictMergeModal
      conflict={payload.conflict}
      yours={payload.yours}
      onCancel={closeConflict}
      onResolve={(sections, baseVersionId) => {
        void onResolve(sections, baseVersionId);
      }}
    />
  );
}
