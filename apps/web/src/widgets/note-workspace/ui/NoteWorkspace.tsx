import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import type { NoteDetail, VersionConflictError } from "@soulside/domain";
import { isContentReadOnly } from "@soulside/domain";
import {
  isDraftDirty,
  setDevFailNext,
  useEditorDraftStore,
  NoteStatusBadge,
  type EditorDraft,
} from "@entities/note";
import { can as canCapability, useActor } from "@entities/user";
import { SoapEditor } from "@features/edit-soap";
import { NoteActionBar } from "@features/transition-note";
import { useCoalescedAutosave } from "@features/autosave-note";
import { ConflictMergeModal } from "@features/resolve-conflict";
import { Button } from "@shared/ui/button";

type Props = {
  note: NoteDetail;
};

type ConflictState = {
  conflict: VersionConflictError;
  yours: EditorDraft;
};

function saveLabel(status: string, dirty: boolean): string {
  if (status === "saving") return "Saving…";
  if (status === "conflict") return "Conflict";
  if (status === "error") return "Retry save";
  if (dirty || status === "dirty") return "Save now";
  if (status === "saved") return "Saved";
  return "Saved";
}

export function NoteWorkspace({ note }: Props) {
  const actor = useActor();
  const location = useLocation();
  const hydrate = useEditorDraftStore((s) => s.hydrate);
  const applyResolution = useEditorDraftStore((s) => s.applyResolution);
  const draft = useEditorDraftStore((s) => s.drafts[note.id]);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [autosaveOn, setAutosaveOn] = useState(true);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);

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

  const autosave = useCoalescedAutosave({
    note,
    actorId: actor.id,
    enabled: autosaveOn && !readOnly && !conflictState,
    onConflict: (conflict, yours) => {
      setConflictState({ conflict, yours });
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            to={{ pathname: "/notes", search: location.search }}
            className="text-sm text-[var(--accent)] underline-offset-4 hover:underline"
          >
            ← Notes
          </Link>
          <p className="text-sm font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
            Phase 6 · Autosave & conflicts
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={autosaveOn}
                disabled={readOnly}
                onChange={(e) => setAutosaveOn(e.target.checked)}
              />
              Autosave
            </label>
            <Button
              type="button"
              size="sm"
              disabled={
                readOnly ||
                (!dirty && autosave.status !== "error") ||
                autosave.status === "saving" ||
                !!conflictState
              }
              onClick={() => void autosave.saveNow()}
            >
              {saveLabel(autosave.status, dirty)}
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {readOnly
              ? "Read-only for this status/role"
              : conflictState
                ? "Resolve the conflict modal to continue"
                : autosave.status === "saving"
                  ? "Coalesced save in flight…"
                  : dirty
                    ? autosaveOn
                      ? "Dirty — autosave in ~800ms"
                      : "Unsaved section edits"
                    : autosave.status === "saved"
                      ? "All sections clean"
                      : "No local changes"}
          </p>
          {autosave.lastError && autosave.status === "error" && (
            <p className="max-w-sm text-right text-xs text-[var(--danger)]">
              {autosave.lastError}
            </p>
          )}
        </div>
      </div>

      <NoteActionBar note={note} />

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
          SOAP
        </h2>
        <SoapEditor noteId={note.id} readOnly={readOnly || !!conflictState} />
      </section>

      {!readOnly && (
        <section className="space-y-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Demo controls
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Deterministic fail-next / force-conflict (does not require chaos ON).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={autosave.forceConflictNext ? "default" : "outline"}
              onClick={() =>
                autosave.setForceConflictNext(!autosave.forceConflictNext)
              }
            >
              {autosave.forceConflictNext
                ? "Armed: next save → 409"
                : "Force conflict on next save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void setDevFailNext({ versions: 1 }).then(() =>
                  setDemoMsg("Next version POST will 500 (rollback optimism)"),
                )
              }
            >
              Fail next save (500)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void setDevFailNext({ noteGets: 1 }).then(() =>
                  setDemoMsg(
                    "Next detail refetch will 500 — edit while dirty to see hydrate keep your draft",
                  ),
                )
              }
            >
              Fail next detail GET (500)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void setDevFailNext({ conflicts: 1 }).then(() =>
                  setDemoMsg("Next version POST will force 409 (server counter)"),
                )
              }
            >
              Queue server conflict (fail-next)
            </Button>
          </div>
          {demoMsg && (
            <p className="text-xs text-[var(--muted)]">{demoMsg}</p>
          )}
        </section>
      )}

      {conflictState && (
        <ConflictMergeModal
          conflict={conflictState.conflict}
          yours={conflictState.yours}
          onCancel={() => setConflictState(null)}
          onResolve={(sections, baseVersionId) => {
            applyResolution({
              noteId: note.id,
              baseVersionId,
              sections,
            });
            setConflictState(null);
            void autosave.saveNow();
          }}
        />
      )}
    </div>
  );
}
