import { useEffect, useMemo, useState } from "react";
import type { NoteDetail, NoteStatus } from "@soulside/domain";
import {
  listPendingForNote,
  subscribeQueueStats,
  type TransitionPayload,
} from "@features/offline-queue";
import type { MutationQueueItem } from "@shared/db";

type Props = {
  note: NoteDetail;
};

type TimelineRow = {
  id: string;
  kind: "server" | "pending";
  at: string;
  title: string;
  detail?: string;
};

function statusLabel(s: NoteStatus | null): string {
  if (!s) return "—";
  return s.replaceAll("_", " ");
}

export function ReviewTimeline({ note }: Props) {
  const [pending, setPending] = useState<MutationQueueItem[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void listPendingForNote(note.id).then((rows) => {
        if (alive) setPending(rows);
      });
    };
    refresh();
    return subscribeQueueStats(refresh);
  }, [note.id]);

  const rows = useMemo(() => {
    const server: TimelineRow[] = [...note.review.events]
      .sort(
        (a, b) =>
          Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
          b.id.localeCompare(a.id),
      )
      .map((e) => ({
        id: e.id,
        kind: "server" as const,
        at: e.occurredAt,
        title: `${statusLabel(e.fromStatus)} → ${statusLabel(e.toStatus)}`,
        detail: [
          e.actorRole,
          e.actorId,
          e.reason ? `reason: ${e.reason}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }));

    const optimistic: TimelineRow[] = pending
      .filter((p) => p.type === "transition")
      .map((p) => {
        const payload = p.payload as TransitionPayload;
        return {
          id: `pending_${p.clientMutationId}`,
          kind: "pending" as const,
          at: p.createdAt,
          title: `Pending → ${statusLabel(payload.to)}`,
          detail: "Queued offline · will replace with server event on sync",
        };
      });

    const versionPending = pending
      .filter((p) => p.type === "create_version")
      .map((p) => ({
        id: `pending_ver_${p.clientMutationId}`,
        kind: "pending" as const,
        at: p.createdAt,
        title: "Pending version save",
        detail: "Queued offline · SOAP write waiting to sync",
      }));

    return [...optimistic, ...versionPending, ...server].sort(
      (a, b) => Date.parse(b.at) - Date.parse(a.at),
    );
  }, [note.review.events, pending]);

  return (
    <section className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div>
        <h2 className="text-sm font-semibold tracking-wide uppercase">
          Review timeline
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Projection over the review event log. Offline queue items show until
          the server ack replaces them.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No review events yet.</p>
      ) : (
        <ol className="relative space-y-0 border-l border-[var(--border)] pl-4">
          {rows.map((row) => (
            <li key={row.id} className="relative pb-4 last:pb-0">
              <span
                className={`absolute -left-[1.15rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)] ${
                  row.kind === "pending"
                    ? "bg-amber-500"
                    : "bg-teal-700"
                }`}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  {row.title}
                  {row.kind === "pending" && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900 uppercase">
                      Optimistic
                    </span>
                  )}
                </p>
                <time className="text-[11px] text-[var(--muted)]">
                  {new Date(row.at).toLocaleString()}
                </time>
              </div>
              {row.detail && (
                <p className="mt-0.5 text-xs text-[var(--muted)]">{row.detail}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
