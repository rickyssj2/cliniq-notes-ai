import { useEffect, useState, useSyncExternalStore } from "react";
import {
  flushNow,
  getTelemetryStats,
  subscribeTelemetryStats,
  track,
} from "@shared/telemetry";
import { getLastCorrelationId } from "@shared/correlation";
import { apiFetch } from "@shared/api";
import { Button } from "@shared/ui/button";

/**
 * Dev-only panel: queue/batch/park counts — never shows event props (PII).
 */
export function TelemetryDebugPanel() {
  const [open, setOpen] = useState(false);
  const stats = useSyncExternalStore(
    subscribeTelemetryStats,
    getTelemetryStats,
    getTelemetryStats,
  );
  const [serverBatches, setServerBatches] = useState<number | null>(null);
  const [lastCorr, setLastCorr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setLastCorr(getLastCorrelationId());
      void apiFetch<{ totalBatches: number }>("/telemetry/recent")
        .then(({ data }) => setServerBatches(data.totalBatches))
        .catch(() => setServerBatches(null));
    }, 2000);
    return () => window.clearInterval(id);
  }, [open]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed right-3 bottom-3 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="w-72 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-xs shadow-lg">
          <p className="font-semibold tracking-wide uppercase text-[var(--muted)]">
            Telemetry (dev)
          </p>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className="text-[var(--muted)]">Buffered</dt>
            <dd className="font-mono">{stats.buffered}</dd>
            <dt className="text-[var(--muted)]">Flushed events</dt>
            <dd className="font-mono">{stats.flushedEvents}</dd>
            <dt className="text-[var(--muted)]">Flushed batches</dt>
            <dd className="font-mono">{stats.flushedBatches}</dd>
            <dt className="text-[var(--muted)]">Parked (IDB)</dt>
            <dd className="font-mono">{stats.parkedBatches}</dd>
            <dt className="text-[var(--muted)]">Failed attempts</dt>
            <dd className="font-mono">{stats.failedAttempts}</dd>
            <dt className="text-[var(--muted)]">Server batches</dt>
            <dd className="font-mono">{serverBatches ?? "—"}</dd>
            <dt className="text-[var(--muted)]">Last corr</dt>
            <dd className="truncate font-mono" title={lastCorr ?? undefined}>
              {lastCorr ?? "—"}
            </dd>
          </dl>
          {stats.lastBatchId && (
            <p className="truncate text-[10px] text-[var(--muted)]">
              last: {stats.lastBatchId}
            </p>
          )}
          {stats.lastError && (
            <p className="text-[10px] text-[var(--danger)]">{stats.lastError}</p>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                track("debug.ping", { source: "panel" });
                track(
                  "debug.pii_probe",
                  {
                    noteId: "note_demo",
                    content: "SHOULD_NEVER_LEAVE_CLIENT",
                    S: "patient free text",
                  },
                  { important: true },
                );
              }}
            >
              Emit sample
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void flushNow()}
            >
              Flush now
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void apiFetch("/dev/chaos", {
                  method: "POST",
                  body: JSON.stringify({ failNext: { telemetry: 3 } }),
                }).then(() => {
                  track(
                    "debug.force_park",
                    { reason: "fail_next_x3" },
                    { important: true },
                  );
                  return flushNow();
                })
              }
            >
              Fail ×3 + flush
            </Button>
          </div>
          <p className="text-[10px] text-[var(--muted)]">
            Counts only — no prop payloads. Parked rows drain on{" "}
            <code>online</code> / Flush now (attempts reset). Watch Network →{" "}
            <code>/api/telemetry/batch</code>.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[11px] font-medium shadow-sm hover:bg-stone-50"
      >
        {open ? "Hide telemetry" : "Telemetry"}
      </button>
    </div>
  );
}
