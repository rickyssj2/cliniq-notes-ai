import { useMemo, useState } from "react";
import { can as machineCan, type Role } from "@soulside/domain";
import {
  transitionNote,
  transitionPatch,
  useNoteSelectionStore,
  usePatchNoteInLists,
  type NoteSummary,
} from "@entities/note";
import { GuardedButton, useActor } from "@entities/user";
import {
  mintCorrelationId,
  runWithCorrelationAsync,
} from "@shared/correlation";
import { log } from "@shared/logging";
import { trackPendingGeneration } from "@shared/realtime";
import { Button } from "@shared/ui/button";

type Props = {
  notesById: Map<string, NoteSummary>;
};

type BulkKind = "start_review" | "regenerate";

function eligibleFor(
  kind: BulkKind,
  note: NoteSummary,
  actor: { id: string; role: Role },
) {
  return machineCan(kind, {
    status: note.status,
    assignedReviewerId: note.assignedReviewer?.id ?? null,
    approvedAt: note.approvedAt,
    now: new Date().toISOString(),
    actor: { id: actor.id, role: actor.role },
    mfaVerified: true,
  });
}

export function BulkActionsBar({ notesById }: Props) {
  const actor = useActor();
  const selectedIds = useNoteSelectionStore((s) => s.selectedIds);
  const clear = useNoteSelectionStore((s) => s.clear);
  const patchNote = usePatchNoteInLists();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(
    () =>
      [...selectedIds]
        .map((id) => notesById.get(id))
        .filter(Boolean) as NoteSummary[],
    [notesById, selectedIds],
  );

  const startEligible = useMemo(
    () => selected.filter((n) => eligibleFor("start_review", n, actor).ok),
    [selected, actor],
  );
  const regenEligible = useMemo(
    () => selected.filter((n) => eligibleFor("regenerate", n, actor).ok),
    [selected, actor],
  );

  if (selectedIds.size === 0) return null;

  const runBulk = async (kind: BulkKind) => {
    const eligible = kind === "start_review" ? startEligible : regenEligible;
    const skipped = selected.length - eligible.length;

    if (eligible.length === 0) {
      setMessage(
        kind === "start_review"
          ? `None of ${selected.length} selected are READY_FOR_REVIEW (Start review skipped).`
          : `None of ${selected.length} selected are FAILED (Request regeneration skipped).`,
      );
      return;
    }

    const correlationId = mintCorrelationId("bulk");
    await runWithCorrelationAsync(correlationId, async () => {
      setBusy(true);
      setMessage(
        skipped > 0
          ? `Running ${eligible.length}… (${skipped} ineligible skipped)`
          : `Running ${eligible.length} in parallel…`,
      );
      log.info("bulk.start", {
        kind,
        selected: selected.length,
        eligible: eligible.length,
        skipped,
      });

      const results = await Promise.allSettled(
        eligible.map(async (note) => {
          const patch = transitionPatch({
            note,
            action: kind,
            actor,
            at: new Date().toISOString(),
          });
          // Eligibility was checked above; a rejection here means the note
          // moved (peer edit / WS) between selection and dispatch.
          if (!patch) {
            throw new Error(`${note.id} is no longer eligible for ${kind}`);
          }
          patchNote({ ...note, ...patch });

          try {
            const result = await transitionNote({
              noteId: note.id,
              to: patch.status,
              actorId: actor.id,
              clientMutationId: `bulk_${kind}_${note.id}_${crypto.randomUUID()}`,
              mfaVerified: true,
            });
            patchNote(result.note);
            return { ok: true as const, noteId: note.id };
          } catch (err) {
            patchNote(note);
            throw err;
          }
        }),
      );

      let ok = 0;
      let failed = 0;
      for (const r of results) {
        if (r.status === "fulfilled") ok += 1;
        else failed += 1;
      }

      const kindLabel =
        kind === "start_review" ? "Start review" : "Request regeneration";
      const parts = [`${kindLabel}: ${ok} ok`];
      if (skipped > 0) {
        parts.push(
          `${skipped} skipped (${
            kind === "start_review" ? "not READY_FOR_REVIEW" : "not FAILED"
          })`,
        );
      }
      if (failed > 0) parts.push(`${failed} failed`);
      if (kind === "regenerate" && ok > 0) {
        const succeededIds = eligible
          .map((n, i) =>
            results[i]?.status === "fulfilled" ? n.id : null,
          )
          .filter(Boolean) as string[];
        trackPendingGeneration(succeededIds);
        parts.push("AI mock finishes in ~5–15s → READY_FOR_REVIEW");
      }
      setMessage(parts.join(" · "));
      clear();
      setBusy(false);
    });
  };

  const startTitle =
    startEligible.length === 0
      ? "Only READY_FOR_REVIEW notes can start review"
      : `Start review on ${startEligible.length} of ${selected.length}`;
  const regenTitle =
    regenEligible.length === 0
      ? "Only FAILED notes can request regeneration"
      : `Regenerate ${regenEligible.length} of ${selected.length} (then ~5–15s to READY)`;

  return (
    <div className="sticky bottom-4 z-10 mx-auto flex max-w-6xl flex-wrap items-center gap-3 rounded-lg border border-(--border) bg-(--card) px-4 py-3 shadow-md">
      <div className="min-w-0">
        <p className="text-sm font-medium">{selectedIds.size} selected</p>
        <p className="text-[11px] text-(--muted)">
          Start review: {startEligible.length}/{selected.length} · Regen:{" "}
          {regenEligible.length}/{selected.length}
        </p>
      </div>
      <GuardedButton
        type="button"
        size="sm"
        capability="bulk_assign"
        disabled={busy || startEligible.length === 0}
        title={startTitle}
        data-shortcut-action="R"
        onClick={() => void runBulk("start_review")}
      >
        Start review
        <kbd className="ml-1.5 rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px]">
          R
        </kbd>
      </GuardedButton>
      <GuardedButton
        type="button"
        size="sm"
        variant="default"
        capability="request_regeneration"
        disabled={busy || regenEligible.length === 0}
        title={regenTitle}
        data-shortcut-action="G"
        onClick={() => void runBulk("regenerate")}
      >
        Request regeneration
        <kbd className="ml-1.5 rounded bg-black/10 px-1.5 py-0.5 font-mono text-[10px]">
          ⇧G
        </kbd>
      </GuardedButton>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={clear}
      >
        Clear selection
      </Button>
      {message && (
        <p className="basis-full text-xs text-(--muted)">{message}</p>
      )}
    </div>
  );
}
