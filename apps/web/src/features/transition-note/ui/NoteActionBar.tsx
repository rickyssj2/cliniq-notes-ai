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

/** Primary (green) CTAs with keyboard shortcuts. */
const PRIMARY_ACTIONS = new Set<NoteAction>(["start_review", "approve"]);
const ACTION_SHORTCUT: Partial<Record<NoteAction, string>> = {
  start_review: "R",
  approve: "A",
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

  const applyOptimisticTransition = (to: NoteDetail["status"], action: NoteAction) => {
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

    queryClient.setQueryData<NoteDetail>(notesQueryKeys.detail(note.id), (old) => {
      if (!old) return old;
      return {
        ...old,
        status: to,
        assignedReviewer: nextAssigned,
        updatedAt: at,
        approvedAt: action === "approve" ? at : old.approvedAt,
      };
    });
  };

  const run = async (action: NoteAction) => {
    setError(null);
    setQueueHint(null);
    let reason: string | undefined;
    if (action === "reject") {
      const entered = window.prompt("Rejection reason (required)");
      if (!entered?.trim()) {
        setError("A rejection reason is required");
        return;
      }
      reason = entered.trim();
    }
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
          await queryClient.invalidateQueries({
            queryKey: notesQueryKeys.detail(note.id),
          });
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

  if (note.status === "LOCKED") {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-stone-50 px-4 py-3 text-sm text-[var(--muted)]">
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
          const label = ACTION_LABEL[item.action] ?? item.action;
          return (
            <span
              key={item.action}
              title={item.enabled ? undefined : item.reason}
            >
              <Button
                type="button"
                size="sm"
                variant={primary ? "default" : "outline"}
                disabled={!item.enabled || busy !== null}
                data-shortcut-action={shortcut ?? undefined}
                onClick={() => void run(item.action)}
              >
                {busy === item.action ? (
                  "Working…"
                ) : (
                  <>
                    {label}
                    {shortcut && item.enabled ? (
                      <kbd className="ml-1 rounded bg-black/10 px-1 py-0.5 font-mono text-[10px] opacity-90">
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
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <p className="text-xs text-[var(--muted)]">
        Primary actions: <kbd className="font-mono">R</kbd> Start review ·{" "}
        <kbd className="font-mono">A</kbd> Approve. Hover disabled buttons for
        machine reasons.
      </p>
    </div>
  );
}
