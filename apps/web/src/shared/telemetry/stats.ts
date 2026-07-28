import type { TelemetryStats } from "./types";

type Listener = () => void;

const listeners = new Set<Listener>();

let stats: TelemetryStats = {
  buffered: 0,
  flushedEvents: 0,
  flushedBatches: 0,
  parkedBatches: 0,
  failedAttempts: 0,
  lastFlushAt: null,
  lastError: null,
  lastBatchId: null,
};

export function getTelemetryStats(): TelemetryStats {
  // Must return a stable reference — useSyncExternalStore uses Object.is.
  // A fresh `{ ...stats }` every call looks like a store change → infinite loop.
  return stats;
}

export function patchTelemetryStats(patch: Partial<TelemetryStats>) {
  stats = { ...stats, ...patch };
  for (const l of listeners) l();
}

export function subscribeTelemetryStats(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
