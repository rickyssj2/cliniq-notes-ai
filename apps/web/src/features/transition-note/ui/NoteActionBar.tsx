import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAvailableActions,
  type NoteAction,
  type NoteDetail,
} from "@soulside/domain";
import {
  notesQueryKeys,
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
import { track } from "@shared/telemetry";
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
]);
const DANGER_ACTIONS = new Set<NoteAction>(["reject"]);
const ACTION_SHORTCUT: Partial<Record<NoteAction, string>> = {
  start_review: "R",
  approve: "A",
  amend: "M",
  reject: "X",
  return: "E",
};

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

  const applyOptimisticTransition = (
    to: NoteDetail["status"],
    action: NoteAction,
  ) => {
    const at = new Date().toISOString();
    const nextAssigned =
      action === "start_review"
        ? { id: actor.id, displayName: actor.displayName, role: actor.role }
        : action === "return" || action === "approve" || action === "reject"
          ? null
          : note.assignedReviewer;

    patchList({
      ...note,
      status: to,
      assignedReviewer: nextAssigned,
      updatedAt: at,
      approvedAt: action === "approve" ? at : note.approvedAt,
    });

    queryClient.setQueryData<NoteDetail>(
      notesQueryKeys.detail(note.id),
      (old) => {
        if (!old) return old;
        return {
          ...old,
          status: to,
          assignedReviewer: nextAssigned,
          updatedAt: at,
          approvedAt: action === "approve" ? at : old.approvedAt,
        };
      },
    );
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

        const queue = async () => {
          await enqueueTransition({
            noteId: note.id,
            clientMutationId,
            to: target.to,
            actorId: actor.id,
            reason,
            mfaVerified: true,
          });
          applyOptimisticTransition(target.to, action);
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
          patchList(result.note);
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: notesQueryKeys.detail(note.id),
            }),
            queryClient.invalidateQueries({
              queryKey: notesQueryKeys.lists(),
            }),
          ]);
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
            await queue();
            return;
          }
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

  if (note.status === "LOCKED") {
    return (
      <div className="rounded-lg border border-(--border) bg-stone-50 px-4 py-3 text-sm text-(--muted)">
        This note is <strong>LOCKED</strong> after the 24h amendment grace
        window. Content is read-only; start a new clinical note if changes are
        required.
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
                data-shortcut-action={shortcut ?? undefined}
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
