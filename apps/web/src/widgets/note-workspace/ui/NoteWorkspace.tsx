import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import type { NoteDetail } from "@soulside/domain";
import { isContentReadOnly } from "@soulside/domain";
import {
  isDraftDirty,
  setDevFailNext,
  useConflictStore,
  useEditorDraftStore,
  usePresenceStore,
  EMPTY_PRESENCE,
  NoteStatusBadge,
} from "@entities/note";
import { can as canCapability, useActor } from "@entities/user";
import { SoapEditor } from "@features/edit-soap";
import { NoteActionBar } from "@features/transition-note";
import { useCoalescedAutosave } from "@features/autosave-note";
import {
  PresenceAvatars,
  useNotePresenceChannel,
} from "@features/realtime-sync";
import {
  getLatestPendingCreateVersion,
  useEffectiveOnline,
  usePendingMutationCount,
  type CreateVersionPayload,
} from "@features/offline-queue";
import { Button } from "@shared/ui/button";

type Props = {
  note: NoteDetail;
};

function saveLabel(status: string, dirty: boolean, pending: number): string {
  if (status === "saving") return "Saving…";
  if (status === "conflict") return "Conflict";
  if (status === "error") return "Retry save";
  if (dirty || status === "dirty") return "Save now";
  if (pending > 0) return "Queued";
  if (status === "saved") return "Saved";
  return "Saved";
}

export function NoteWorkspace({ note }: Props) {
  const actor = useActor();
  const location = useLocation();
  const hydrate = useEditorDraftStore((s) => s.hydrate);
  const applyQueuedSnapshot = useEditorDraftStore((s) => s.applyQueuedSnapshot);
  const draft = useEditorDraftStore((s) => s.drafts[note.id]);
  const conflictOpen = useConflictStore((s) =>
    s.open?.noteId === note.id ? s.open : null,
  );
  const viewers = usePresenceStore(
    (s) => s.byNoteId[note.id] ?? EMPTY_PRESENCE,
  );
  const [autosaveOn, setAutosaveOn] = useState(true);
  const [demoMsg, setDemoMsg] = useState<string | null>(null);
  const online = useEffectiveOnline();
  const pendingAll = usePendingMutationCount();

  useNotePresenceChannel(note.id);

  useEffect(() => {
    hydrate({
      noteId: note.id,
      baseVersionId: note.currentVersion.id,
      content: note.currentVersion.content,
    });
    void getLatestPendingCreateVersion(note.id).then((item) => {
      if (!item) return;
      const current = useEditorDraftStore.getState().drafts[note.id];
      if (current && isDraftDirty(current)) return;
      const payload = item.payload as CreateVersionPayload;
      applyQueuedSnapshot({
        noteId: note.id,
        baseVersionId: payload.baseVersionId,
        sections: payload.content.sections,
      });
    });
  }, [hydrate, applyQueuedSnapshot, note.id, note.currentVersion.id]);

  const readOnly =
    isContentReadOnly(note.status) ||
    !canCapability(actor.role, "mutate_workflow").ok;

  const dirty = isDraftDirty(draft);

  const autosave = useCoalescedAutosave({
    note,
    actorId: actor.id,
    enabled: autosaveOn && !readOnly && !conflictOpen,
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
            Phase 8 · Offline queue
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {note.patient.displayName}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <NoteStatusBadge status={note.status} />
            <PresenceAvatars viewers={viewers} excludeUserId={actor.id} />
            <span>
              Rev {note.currentVersion.revision} ·{" "}
              <code className="text-xs">{note.id}</code>
            </span>
            {note.assignedReviewer && (
              <span>Reviewer: {note.assignedReviewer.displayName}</span>
            )}
            {pendingAll > 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900 uppercase">
                {pendingAll} queued
              </span>
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
                !!conflictOpen
              }
              onClick={() => void autosave.saveNow()}
            >
              {saveLabel(autosave.status, dirty, pendingAll)}
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {readOnly
              ? "Read-only for this status/role"
              : conflictOpen
                ? "Resolve the conflict modal to continue"
                : autosave.status === "saving"
                  ? "Coalesced save in flight…"
                  : dirty
                    ? autosaveOn
                      ? online
                        ? "Dirty — autosave in ~800ms"
                        : "Dirty — will queue offline (~800ms)"
                      : "Unsaved section edits"
                    : pendingAll > 0
                      ? "Locally clean · waiting for sync"
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
        <SoapEditor noteId={note.id} readOnly={readOnly || !!conflictOpen} />
      </section>

      {!readOnly && (
        <section className="space-y-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Demo controls
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Use DevTools → Network → Offline to queue saves. Reload while
            offline, then go online — watch the banner drain the queue.
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
          </div>
          {demoMsg && (
            <p className="text-xs text-[var(--muted)]">{demoMsg}</p>
          )}
        </section>
      )}
    </div>
  );
}
