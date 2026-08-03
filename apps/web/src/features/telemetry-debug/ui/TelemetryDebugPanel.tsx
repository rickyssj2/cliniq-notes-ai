import { useEffect, useState, useSyncExternalStore } from "react";
import {
  flushNow,
  getTelemetryStats,
  subscribeTelemetryStats,
  track,
} from "@shared/telemetry";
import { getLastCorrelationId } from "@shared/correlation";
import { TOGGLE_TELEMETRY_EVENT } from "@shared/devtools-events";
import { apiFetch } from "@shared/api";
import { Button } from "@shared/ui/button";

/**
 * Dev-only panel: queue/batch/park counts — never shows event props (PII).
 * Toggle with `T` or the FAB button.
 */
export function TelemetryDebugPanel() {  const [open, setOpen] = useState(false);
  const stats = useSyncExternalStore(
    subscribeTelemetryStats,
    getTelemetryStats,
    getTelemetryStats,
  );
  const [serverBatches, setServerBatches] = useState<number | null>(null);
  const [lastCorr, setLastCorr] = useState<string | null>(null);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener(TOGGLE_TELEMETRY_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_TELEMETRY_EVENT, onToggle);
  }, []);

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
        <div className="w-72 space-y-2 rounded-lg border border-(--border) bg-(--card) p-3 text-xs shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold tracking-wide uppercase text-(--muted)">
              Telemetry (dev)
            </p>
            <kbd className="rounded border border-(--border) bg-stone-50 px-1.5 py-0.5 font-mono text-[10px]">
              T
            </kbd>
          </div>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <dt className="text-(--muted)">Buffered</dt>
            <dd className="font-mono">{stats.buffered}</dd>
            <dt className="text-(--muted)">Flushed events</dt>
            <dd className="font-mono">{stats.flushedEvents}</dd>
            <dt className="text-(--muted)">Flushed batches</dt>
            <dd className="font-mono">{stats.flushedBatches}</dd>
            <dt className="text-(--muted)">Parked (IDB)</dt>
            <dd className="font-mono">{stats.parkedBatches}</dd>
            <dt className="text-(--muted)">Failed attempts</dt>
            <dd className="font-mono">{stats.failedAttempts}</dd>
            <dt className="text-(--muted)">Server batches</dt>
            <dd className="font-mono">{serverBatches ?? "—"}</dd>
            <dt className="text-(--muted)">Last corr</dt>
            <dd className="truncate font-mono" title={lastCorr ?? undefined}>
              {lastCorr ?? "—"}
            </dd>
          </dl>
          {stats.lastBatchId && (
            <p className="truncate text-[10px] text-(--muted)">
              last: {stats.lastBatchId}
            </p>
          )}
          {stats.lastError && (
            <p className="text-[10px] text-(--danger)">{stats.lastError}</p>
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
                })
              }
            >
              Fail ×3
            </Button>
          </div>
          <p className="text-[10px] text-(--muted)">
            Counts only — no prop payloads. Parked rows drain on{" "}
            <code>online</code> / Flush now (attempts reset). Watch Network →{" "}
            <code>/api/telemetry/batch</code>.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-(--border) bg-(--card) px-3 py-1.5 text-[11px] font-medium shadow-sm hover:bg-stone-50"
        title="Telemetry (T)"
      >
        {open ? "Hide telemetry" : "Telemetry · T"}
      </button>
    </div>
  );
}
