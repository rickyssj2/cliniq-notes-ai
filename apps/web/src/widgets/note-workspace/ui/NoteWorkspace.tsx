import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import type { NoteDetail } from "@soulside/domain";
import { canEditContent } from "@soulside/domain";
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
import { useCoalescedAutosave, useAutosavePreferenceStore } from "@features/autosave-note";
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
import { NoteHistoryPanel, ReviewTimeline } from "@features/note-history";
import { useDemoControlsStore } from "@features/demo-controls";
import { Button } from "@shared/ui/button";
import { AppErrorBoundary } from "@shared/ui/error-boundary";
import {
  DevThrowRenderButton,
  requestDevThrow,
} from "@shared/ui/dev-throw-render-button";
import { cn, saveModKeyLabel } from "@shared/lib";

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

type MobilePanel = "none" | "timeline" | "history";

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
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("none");
  const [failNextArmed, setFailNextArmed] = useState(false);
  const autosaveOn = useAutosavePreferenceStore((s) => s.enabled);
  const setAutosaveOn = useAutosavePreferenceStore((s) => s.setEnabled);
  const online = useEffectiveOnline();
  const pendingAll = usePendingMutationCount();
  const registerDemo = useDemoControlsStore((s) => s.register);
  const clearDemo = useDemoControlsStore((s) => s.clear);
  const setDemoMessage = useDemoControlsStore((s) => s.setMessage);

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

  const contentGate = canEditContent({
    status: note.status,
    assignedReviewerId: note.assignedReviewer?.id ?? null,
    actor: { id: actor.id, role: actor.role },
  });
  const capabilityGate = canCapability(actor.role, "mutate_workflow");
  const readOnly = !contentGate.ok || !capabilityGate.ok;
  const readOnlyReason = !capabilityGate.ok
    ? capabilityGate.reason
    : !contentGate.ok
      ? contentGate.reason
      : null;

  const dirty = isDraftDirty(draft);

  const autosave = useCoalescedAutosave({
    note,
    actorId: actor.id,
    enabled: autosaveOn && !readOnly && !conflictOpen,
  });

  useEffect(() => {
    if (readOnly) {
      registerDemo([
        {
          id: "throw-page",
          label: "Throw page error",
          onClick: () => requestDevThrow("note-page"),
        },
      ]);
      return () => clearDemo();
    }

    registerDemo([
      {
        id: "force-conflict",
        label: autosave.forceConflictNext
          ? "Armed: next save → 409"
          : "Force conflict on next save",
        active: autosave.forceConflictNext,
        onClick: () =>
          autosave.setForceConflictNext(!autosave.forceConflictNext),
      },
      {
        id: "fail-versions",
        label: failNextArmed
          ? "Armed: all saves → 500"
          : "Fail all version saves (500)",
        active: failNextArmed,
        onClick: () => {
          if (failNextArmed) {
            void setDevFailNext({ versions: 0 }).then(() => {
              setFailNextArmed(false);
              setDemoMessage("Version save failures cleared.");
            });
          } else {
            void setDevFailNext({ versions: 1 }).then(() => {
              setFailNextArmed(true);
              setDemoMessage(
                "All version POSTs will 500 until you disarm this control.",
              );
            });
          }
        },
      },
      {
        id: "throw-soap",
        label: "Throw SOAP panel error",
        onClick: () => requestDevThrow("soap-panel"),
      },
      {
        id: "throw-page",
        label: "Throw page error",
        onClick: () => requestDevThrow("note-page"),
      },
    ]);
    return () => clearDemo();
  }, [
    readOnly,
    registerDemo,
    clearDemo,
    setDemoMessage,
    autosave.forceConflictNext,
    autosave.setForceConflictNext,
    failNextArmed,
  ]);

  const modKey = saveModKeyLabel();

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6">
      <DevThrowRenderButton
        id="note-page"
        hidden
        message="Dev: intentional page crash"
      />

      {/* Mobile panel toggles */}
      <div className="mb-4 flex flex-wrap gap-2 xl:hidden">
        <Button
          type="button"
          size="sm"
          variant={mobilePanel === "timeline" ? "default" : "outline"}
          onClick={() =>
            setMobilePanel((p) => (p === "timeline" ? "none" : "timeline"))
          }
        >
          Timeline
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mobilePanel === "history" ? "default" : "outline"}
          onClick={() =>
            setMobilePanel((p) => (p === "history" ? "none" : "history"))
          }
        >
          History
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)_minmax(16rem,20rem)]">
        {/* Left: timeline sidebar */}
        <aside
          className={cn(
            "xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:self-start",
            "rounded-lg border border-(--border) bg-(--card) p-4",
            mobilePanel === "timeline" ? "block" : "hidden xl:block",
          )}
        >
          <AppErrorBoundary label="review-timeline" variant="panel">
            <ReviewTimeline note={note} variant="sidebar" />
          </AppErrorBoundary>
        </aside>

        {/* Center: editor */}
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Link
                to={{ pathname: "/notes", search: location.search }}
                className="text-sm text-(--accent) underline-offset-4 hover:underline"
              >
                ← Notes
              </Link>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {note.patient.displayName}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-(--muted)">
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
                <label className="flex items-center gap-2 text-xs text-(--muted)">
                  <input
                    type="checkbox"
                    checked={autosaveOn}
                    disabled={readOnly}
                    onChange={(e) => setAutosaveOn(e.target.checked)}
                    onKeyDown={(e) => {
                      // Native checkboxes toggle on Space only; Enter is expected by many users.
                      if (e.key === "Enter" && !readOnly) {
                        e.preventDefault();
                        setAutosaveOn(!autosaveOn);
                      }
                    }}
                  />
                  Autosave
                </label>
                <Button
                  type="button"
                  size="sm"
                  data-shortcut-save
                  disabled={
                    readOnly ||
                    (!dirty && autosave.status !== "error") ||
                    autosave.status === "saving" ||
                    !!conflictOpen
                  }
                  onClick={() => void autosave.saveNow()}
                >
                  {saveLabel(autosave.status, dirty, pendingAll)}
                  <kbd className="ml-1.5 rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px] opacity-90">
                    {modKey}&nbsp;S
                  </kbd>
                </Button>
              </div>
              <p className="text-xs text-(--muted)">
                {readOnly
                  ? (readOnlyReason ?? "Read-only for this status/role")
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
                <p className="max-w-sm text-right text-xs text-(--danger)">
                  {autosave.lastError}
                </p>
              )}
            </div>
          </div>

          <NoteActionBar note={note} />

          <AppErrorBoundary label="soap-editor" variant="panel">
            <section className="rounded-lg border border-(--border) bg-(--card) p-4">
              <h2 className="mb-4 text-sm font-semibold tracking-wide uppercase">
                SOAP
              </h2>
              <SoapEditor
                noteId={note.id}
                readOnly={readOnly || !!conflictOpen}
              />
              <DevThrowRenderButton
                id="soap-panel"
                hidden
                message="Dev: intentional SOAP panel crash"
              />
            </section>
          </AppErrorBoundary>
        </div>

        {/* Right: version history sidebar */}
        <aside
          className={cn(
            "xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:self-start",
            "rounded-lg border border-(--border) bg-(--card) p-4",
            mobilePanel === "history" ? "block" : "hidden xl:block",
          )}
        >
          <AppErrorBoundary label="note-history" variant="panel">
            <NoteHistoryPanel note={note} variant="sidebar" />
          </AppErrorBoundary>
        </aside>
      </div>
    </div>
  );
}
