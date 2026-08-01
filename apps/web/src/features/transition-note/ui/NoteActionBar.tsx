import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAvailableActions,
  type NoteAction,
  type NoteDetail,
} from "@soulside/domain";
import {
  applyOptimisticDetailTransition,
  getLifecycleBanner,
  notesQueryKeys,
  reconcileDetailTransition,
  rollbackDetailTransition,
  transitionNote,
  usePatchNoteInLists,
} from "@entities/note";
import { useActor } from "@entities/user";
import {
  enqueueTransition,
  isEffectivelyOnline,
  subscribeQueueStats,
  useEffectiveOnline,
  countPendingForNote,
} from "@features/offline-queue";
import { ApiError } from "@shared/api";
import {
  mintCorrelationId,
  runWithCorrelationAsync,
} from "@shared/correlation";
import { log } from "@shared/logging";
import { pushNotice } from "@shared/notices";
import { track } from "@shared/telemetry";
import { trackPendingGeneration } from "@shared/realtime";
import { Button } from "@shared/ui/button";
import { cn } from "@shared/lib";

const ACTION_LABEL: Record<NoteAction, string> = {
  "generation.complete": "Generation complete",
  "generation.error": "Generation failed",
  regenerate: "Regenerate",
  start_review: "Start review",
  return: "Return to queue",
  approve: "Approve",
  reject: "Reject",
  resubmit: "Resubmit",
  amend: "Amend",
  grace_expired: "Lock",
};

/** Primary (green) CTAs. */
const PRIMARY_ACTIONS = new Set<NoteAction>([
  "start_review",
  "approve",
  "amend",
  "regenerate",
]);
const DANGER_ACTIONS = new Set<NoteAction>(["reject"]);
const ACTION_SHORTCUT: Partial<Record<NoteAction, string>> = {
  start_review: "R",
  approve: "A",
  amend: "M",
  reject: "X",
  return: "E",
  regenerate: "⇧G",
};

function apiErrorReason(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : "Unknown error";
  }
  const body = err.body;
  if (typeof body === "object" && body !== null) {
    if (
      "reason" in body &&
      typeof (body as { reason?: unknown }).reason === "string"
    ) {
      return (body as { reason: string }).reason;
    }
    if (
      "message" in body &&
      typeof (body as { message?: unknown }).message === "string"
    ) {
      return (body as { message: string }).message;
    }
    if (
      "error" in body &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      return (body as { error: string }).error;
    }
  }
  return `HTTP ${err.status}`;
}

function transitionFailureNotice(
  action: NoteAction,
  to: string,
  err: unknown,
): { title: string; body: string } {
  const reason = apiErrorReason(err);
  const status = err instanceof ApiError ? err.status : 0;

  if (status === 409 || /invalid_transition|transition_rejected/i.test(reason)) {
    if (action === "start_review" || to === "IN_REVIEW") {
      return {
        title: "Couldn’t start review",
        body: `Another reviewer already started reviewing this note, or its status changed. ${reason}`,
      };
    }
    return {
      title: "Action conflicted",
      body: `This note changed state before your “${ACTION_LABEL[action] ?? action}” could complete. ${reason}`,
    };
  }

  return {
    title: "Transition failed",
    body: `Your “${ACTION_LABEL[action] ?? action}” was rolled back. ${reason}`,
  };
}

type Props = {
  note: NoteDetail;
};

export function NoteActionBar({ note }: Props) {
  const actor = useActor();
  const online = useEffectiveOnline();
  const queryClient = useQueryClient();
  const patchList = usePatchNoteInLists();
  const [busy, setBusy] = useState<NoteAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueHint, setQueueHint] = useState<string | null>(null);
  const [pendingHere, setPendingHere] = useState(0);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void countPendingForNote(note.id).then((n) => {
        if (alive) setPendingHere(n);
      });
    };
    refresh();
    return subscribeQueueStats(refresh);
  }, [note.id]);

  useEffect(() => {
    if (online && pendingHere === 0) {
      setQueueHint(null);
    }
  }, [online, pendingHere]);

  const actions = useMemo(
    () =>
      getAvailableActions({
        status: note.status,
        assignedReviewerId: note.assignedReviewer?.id ?? null,
        approvedAt: note.approvedAt ?? null,
        now: new Date().toISOString(),
        actor: { id: actor.id, role: actor.role },
        mfaVerified: true,
        reason: "pending",
      }),
    [actor.id, actor.role, note.approvedAt, note.assignedReviewer?.id, note.status],
  );

  const lifecycleBanner = useMemo(
    () => getLifecycleBanner(note.status),
    [note.status],
  );

  const applyOptimistic = (
    action: NoteAction,
    clientMutationId: string,
    reason?: string,
  ) => {
    const outcome = applyOptimisticDetailTransition(queryClient, {
      note,
      action,
      actor: {
        id: actor.id,
        displayName: actor.displayName,
        role: actor.role,
      },
      reason,
      clientMutationId,
      at: new Date().toISOString(),
    });

    if (!outcome) return undefined;

    patchList({ ...note, ...outcome.patch });
    return outcome.snapshot;
  };

  const run = async (action: NoteAction, reason?: string) => {
    setError(null);
    setQueueHint(null);

    if (action === "approve") {
      const ok = window.confirm(
        "Approve this note? (Mock MFA: confirm stands in for re-auth.)",
      );
      if (!ok) return;
    }

    const target = actions.find((a) => a.action === action);
    if (!target?.enabled) return;

    const clientMutationId = `ui_${action}_${note.id}_${crypto.randomUUID()}`;
    const correlationId = mintCorrelationId("transition");
    setBusy(action);
    try {
      await runWithCorrelationAsync(correlationId, async () => {
        log.info("transition.start", {
          noteId: note.id,
          action,
          to: target.to,
        });

        const snapshot = applyOptimistic(action, clientMutationId, reason);

        const queue = async () => {
          await enqueueTransition({
            noteId: note.id,
            clientMutationId,
            to: target.to,
            actorId: actor.id,
            reason,
            mfaVerified: true,
          });
          track(
            "note.transition_queued",
            { noteId: note.id, action, to: target.to },
            { important: true },
          );
          setQueueHint("Queued offline — will sync when back online");
        };

        if (!isEffectivelyOnline()) {
          await queue();
          return;
        }

        try {
          const result = await transitionNote({
            noteId: note.id,
            to: target.to,
            actorId: actor.id,
            reason,
            mfaVerified: true,
            clientMutationId,
          });
          reconcileDetailTransition(queryClient, {
            noteId: note.id,
            clientMutationId,
            note: result.note,
            event: result.event,
          });
          patchList(result.note);
          if (action === "regenerate") {
            trackPendingGeneration(note.id);
          }
          track(
            "note.transition",
            { noteId: note.id, action, to: target.to },
            { important: true },
          );
        } catch (err) {
          if (
            (err instanceof ApiError && err.status === 0) ||
            err instanceof TypeError ||
            !isEffectivelyOnline()
          ) {
            // Keep optimistic local ReviewEvent; queue will reconcile on drain.
            await queue();
            return;
          }
          if (snapshot) {
            rollbackDetailTransition(queryClient, note.id, snapshot);
            patchList(snapshot);
          }
          const notice = transitionFailureNotice(action, target.to, err);
          pushNotice({
            kind: "warning",
            noteId: note.id,
            title: notice.title,
            body: notice.body,
            ttlMs: 12_000,
          });
          // Snapshot may be stale if a peer transition already landed via WS.
          void queryClient.invalidateQueries({
            queryKey: notesQueryKeys.detail(note.id),
          });
          void queryClient.invalidateQueries({
            queryKey: notesQueryKeys.lists(),
          });
          throw err;
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transition failed");
    } finally {
      setBusy(null);
    }
  };

  const onActionClick = (action: NoteAction) => {
    if (action === "reject") {
      setRejectReason("");
      setRejectOpen(true);
      return;
    }
    void run(action);
  };

  const confirmReject = () => {
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setError("A rejection reason is required");
      return;
    }
    setRejectOpen(false);
    void run("reject", trimmed);
  };

  if (lifecycleBanner) {
    return (
      <div className="rounded-lg border border-(--border) bg-stone-50 px-4 py-3 text-sm text-(--muted)">
        {lifecycleBanner}
      </div>
    );
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((item) => {
          const shortcut = ACTION_SHORTCUT[item.action];
          const primary = PRIMARY_ACTIONS.has(item.action);
          const danger = DANGER_ACTIONS.has(item.action);
          const label = ACTION_LABEL[item.action] ?? item.action;
          return (
            <span
              key={item.action}
              title={item.enabled ? undefined : item.reason}
            >
              <Button
                type="button"
                size="sm"
                variant={danger ? "danger" : primary ? "default" : "outline"}
                disabled={!item.enabled || busy !== null}
                data-shortcut-action={
                  item.action === "regenerate"
                    ? "G"
                    : (shortcut ?? undefined)
                }
                onClick={() => onActionClick(item.action)}
              >
                {busy === item.action ? (
                  "Working…"
                ) : (
                  <>
                    {label}
                    {shortcut ? (
                      <kbd
                        className={cn(
                          "ml-1.5 rounded px-1.5 py-0.5 font-mono text-[10px]",
                          item.enabled
                            ? "bg-black/10 opacity-90"
                            : "bg-black/5 opacity-70",
                        )}
                      >
                        {shortcut}
                      </kbd>
                    ) : null}
                  </>
                )}
              </Button>
            </span>
          );
        })}
      </div>
      {queueHint && pendingHere > 0 && (
        <p className="text-sm text-amber-800">{queueHint}</p>
      )}
      {error && <p className="text-sm text-(--danger)">{error}</p>}
      <p className="text-xs text-(--muted)">
        <kbd className="font-mono">R</kbd> Start ·{" "}
        <kbd className="font-mono">A</kbd> Approve ·{" "}
        <kbd className="font-mono">M</kbd> Amend ·{" "}
        <kbd className="font-mono">X</kbd> Reject ·{" "}
        <kbd className="font-mono">E</kbd> Return to queue
      </p>

      {rejectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-title"
          onClick={() => setRejectOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-lg border border-(--border) bg-(--card) p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reject-title" className="text-sm font-semibold">
              Reject note
            </h2>
            <p className="text-xs text-(--muted)">
              A reason is required and becomes part of the review timeline.
            </p>
            <textarea
              autoFocus
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Missing plan section / incorrect assessment"
              className="w-full rounded-md border border-(--border) bg-white px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setRejectOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={!rejectReason.trim() || busy !== null}
                onClick={confirmReject}
              >
                Confirm reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
