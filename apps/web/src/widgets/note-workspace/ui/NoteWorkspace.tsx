import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { isContentReadOnly, type NoteDetail } from "@soulside/domain";
import {
  isDraftDirty,
  notesQueryKeys,
  saveNoteVersion,
  useEditorDraftStore,
  usePatchNoteInLists,
  NoteStatusBadge,
} from "@entities/note";
import { can as canCapability, useActor } from "@entities/user";
import { SoapEditor } from "@features/edit-soap";
import { NoteActionBar } from "@features/transition-note";
import { ApiError } from "@shared/api";
import { Button } from "@shared/ui/button";

type Props = {
  note: NoteDetail;
};

export function NoteWorkspace({ note }: Props) {
  const actor = useActor();
  const queryClient = useQueryClient();
  const patchList = usePatchNoteInLists();
  const hydrate = useEditorDraftStore((s) => s.hydrate);
  const markClean = useEditorDraftStore((s) => s.markClean);
  const draft = useEditorDraftStore((s) => s.drafts[note.id]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    hydrate({
      noteId: note.id,
      baseVersionId: note.currentVersion.id,
      content: note.currentVersion.content,
    });
  }, [
    hydrate,
    note.currentVersion.content,
    note.currentVersion.id,
    note.id,
  ]);

  const readOnly =
    isContentReadOnly(note.status) ||
    !canCapability(actor.role, "mutate_workflow").ok;

  const dirty = isDraftDirty(draft);

  const onSave = async () => {
    if (!draft || readOnly || !dirty) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const result = await saveNoteVersion({
        noteId: note.id,
        baseVersionId: draft.baseVersionId,
        content: { sections: draft.sections },
        clientMutationId: `save_${note.id}_${crypto.randomUUID()}`,
        actorId: actor.id,
      });
      markClean(note.id, result.version.id);
      await queryClient.invalidateQueries({
        queryKey: notesQueryKeys.detail(note.id),
      });
      // Keep list row revision in sync when possible
      patchList({
        ...note,
        currentVersion: {
          id: result.version.id,
          revision: result.version.revision,
          parentVersionId: result.version.parentVersionId,
        },
        updatedAt: new Date().toISOString(),
      });
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      if (err instanceof ApiError) {
        setSaveError(`Save failed (${err.status}): ${JSON.stringify(err.body)}`);
      } else {
        setSaveError(err instanceof Error ? err.message : "Save failed");
      }
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            to="/notes"
            className="text-sm text-[var(--accent)] underline-offset-4 hover:underline"
          >
            ← Notes
          </Link>
          <p className="text-sm font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
            Phase 5 · Detail
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {note.patient.displayName}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <NoteStatusBadge status={note.status} />
            <span>
              Rev {note.currentVersion.revision} ·{" "}
              <code className="text-xs">{note.id}</code>
            </span>
            {note.assignedReviewer && (
              <span>Reviewer: {note.assignedReviewer.displayName}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            size="sm"
            disabled={readOnly || !dirty || saveState === "saving"}
            onClick={() => void onSave()}
          >
            {saveState === "saving" ? "Saving…" : dirty ? "Save draft" : "Saved"}
          </Button>
          <p className="text-xs text-[var(--muted)]">
            {readOnly
              ? "Read-only for this status/role"
              : dirty
                ? "Unsaved section edits"
                : saveState === "saved"
                  ? "All sections clean"
                  : "No local changes"}
          </p>
          {saveError && (
            <p className="text-xs text-[var(--danger)]">{saveError}</p>
          )}
        </div>
      </div>

      <NoteActionBar note={note} />

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
          SOAP
        </h2>
        <SoapEditor noteId={note.id} readOnly={readOnly} />
      </section>

      <p className="text-xs text-[var(--muted)]">
        Presence indicators arrive in Phase 7. Autosave coalescing + conflict
        merge arrive in Phase 6 (Save is manual for now).
      </p>
    </div>
  );
}
