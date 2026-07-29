import { useMemo, useState } from "react";
import { can as machineCan } from "@soulside/domain";
import {
  transitionNote,
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
import { Button } from "@shared/ui/button";

type Props = {
  notesById: Map<string, NoteSummary>;
};

export function BulkActionsBar({ notesById }: Props) {
  const actor = useActor();
  const selectedIds = useNoteSelectionStore((s) => s.selectedIds);
  const clear = useNoteSelectionStore((s) => s.clear);
  const patchNote = usePatchNoteInLists();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(
    () => [...selectedIds].map((id) => notesById.get(id)).filter(Boolean) as NoteSummary[],
    [notesById, selectedIds],
  );

  if (selectedIds.size === 0) return null;

  const runBulk = async (kind: "start_review" | "regenerate") => {
    const correlationId = mintCorrelationId("bulk");
    await runWithCorrelationAsync(correlationId, async () => {
      setBusy(true);
      setMessage(null);
      let ok = 0;
      let skipped = 0;
      let failed = 0;
      log.info("bulk.start", { kind, selected: selected.length });

      for (const note of selected) {
        const to = kind === "start_review" ? "IN_REVIEW" : "GENERATING";
        const action = kind === "start_review" ? "start_review" : "regenerate";
        const gate = machineCan(action, {
          status: note.status,
          assignedReviewerId: note.assignedReviewer?.id ?? null,
          approvedAt: null,
          now: new Date().toISOString(),
          actor: { id: actor.id, role: actor.role },
          mfaVerified: true,
        });

        if (!gate.ok) {
          skipped += 1;
          continue;
        }

        // Optimistic patch
        const optimistic: NoteSummary = {
          ...note,
          status: to,
          assignedReviewer:
            kind === "start_review"
              ? { id: actor.id, displayName: actor.displayName, role: actor.role }
              : null,
          approvedAt: note.approvedAt ?? null,
          updatedAt: new Date().toISOString(),
        };
        patchNote(optimistic);

        try {
          const result = await transitionNote({
            noteId: note.id,
            to,
            actorId: actor.id,
            clientMutationId: `bulk_${kind}_${note.id}_${crypto.randomUUID()}`,
            mfaVerified: true,
          });
          patchNote(result.note);
          ok += 1;
        } catch {
          patchNote(note); // rollback
          failed += 1;
        }
      }

      setMessage(
        `${kind}: ${ok} ok, ${skipped} skipped (machine), ${failed} failed`,
      );
      clear();
      setBusy(false);
    });
  };

  return (
    <div className="sticky bottom-4 z-10 mx-auto flex max-w-6xl flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-md">
      <p className="text-sm font-medium">{selectedIds.size} selected</p>
      <GuardedButton
        type="button"
        size="sm"
        capability="bulk_assign"
        disabled={busy}
        onClick={() => void runBulk("start_review")}
      >
        Start review (assign me)
      </GuardedButton>
      <GuardedButton
        type="button"
        size="sm"
        variant="outline"
        capability="mutate_workflow"
        disabled={busy}
        onClick={() => void runBulk("regenerate")}
      >
        Request regeneration
      </GuardedButton>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={clear}>
        Clear selection
      </Button>
      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}
