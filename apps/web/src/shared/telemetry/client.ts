import { config } from "@shared/config";
import { db } from "@shared/db";
import { getCorrelationId } from "@shared/correlation";
import { redactProps } from "./redact";
import { getTelemetryStats, patchTelemetryStats } from "./stats";
import type { TelemetryEvent, TelemetryProps, TrackOptions } from "./types";

const BATCH_MAX = 20;
const BATCH_MS = 4_000;
const MAX_SEND_ATTEMPTS = 3;
const IMPORTANT_FLUSH_MS = 800;

let buffer: TelemetryEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let booted = false;

function mintId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function scheduleFlush(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush("timer");
  }, ms);
}

function bumpBuffered() {
  patchTelemetryStats({ buffered: buffer.length });
}

/**
 * Only public telemetry API. Batches by size/time; parks in Dexie after
 * repeated failures; flushes via sendBeacon/keepalive on unload.
 */
export function track(
  name: string,
  props: TelemetryProps = {},
  options: TrackOptions = {},
) {
  ensureBooted();
  const correlationId =
    (typeof props.correlationId === "string" && props.correlationId) ||
    getCorrelationId();
  const event: TelemetryEvent = {
    id: mintId("tev"),
    name,
    props: redactProps({
      ...props,
      ...(correlationId ? { correlationId } : {}),
    }),
    important: Boolean(options.important),
    at: new Date().toISOString(),
  };
  buffer.push(event);
  bumpBuffered();

  if (buffer.length >= BATCH_MAX) {
    void flush("size");
    return;
  }
  scheduleFlush(options.important ? IMPORTANT_FLUSH_MS : BATCH_MS);
}

export async function flush(reason = "manual"): Promise<void> {
  ensureBooted();
  if (flushing) return;
  if (buffer.length === 0) {
    await replayParked();
    return;
  }

  flushing = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const events = buffer;
  buffer = [];
  bumpBuffered();

  const batchId = mintId("tbatch");
  const unload = reason === "unload" || reason === "visibility";
  try {
    await sendWithRetries(batchId, events, unload);
    patchTelemetryStats({
      flushedEvents: getTelemetryStats().flushedEvents + events.length,
      flushedBatches: getTelemetryStats().flushedBatches + 1,
      lastFlushAt: new Date().toISOString(),
      lastBatchId: batchId,
      lastError: null,
    });
    await replayParked();
  } catch (err) {
    const message = err instanceof Error ? err.message : "flush_failed";
    patchTelemetryStats({ lastError: message });
    // Park only after in-memory retries are exhausted (or single unload attempt).
    await parkBatch(batchId, events, message);
  } finally {
    flushing = false;
  }
}

/** Unload/visibility: one shot. Otherwise retry before parking in Dexie. */
async function sendWithRetries(
  batchId: string,
  events: TelemetryEvent[],
  unload: boolean,
): Promise<void> {
  const attempts = unload ? 1 : MAX_SEND_ATTEMPTS;
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await sendBatch(batchId, events, unload);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("flush_failed");
      patchTelemetryStats({
        failedAttempts: getTelemetryStats().failedAttempts + 1,
        lastError: lastError.message,
      });
    }
  }
  throw lastError ?? new Error("flush_failed");
}

async function sendBatch(
  batchId: string,
  events: TelemetryEvent[],
  unload: boolean,
): Promise<void> {
  const payload = JSON.stringify({ batchId, events });
  const url = `${config.apiBaseUrl}/telemetry/batch`;

  if (unload && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    const ok = navigator.sendBeacon(url, blob);
    if (ok) return;
    // Fall through to keepalive fetch
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: unload,
  });
  if (!res.ok) {
    throw new Error(`telemetry HTTP ${res.status}`);
  }
}

async function parkBatch(
  batchId: string,
  events: TelemetryEvent[],
  lastError: string,
) {
  await db.open();
  const existing = await db.telemetryPark
    .where("batchId")
    .equals(batchId)
    .first();
  if (existing?.id != null) {
    await db.telemetryPark.update(existing.id, {
      attempts: existing.attempts + 1,
      lastError,
      events,
    });
  } else {
    await db.telemetryPark.add({
      batchId,
      events,
      attempts: 1,
      createdAt: new Date().toISOString(),
      lastError,
    });
  }
  const parked = await db.telemetryPark.count();
  patchTelemetryStats({ parkedBatches: parked });
}

async function replayParked() {
  await db.open();
  const rows = await db.telemetryPark.orderBy("createdAt").toArray();
  for (const row of rows) {
    if (row.attempts >= MAX_SEND_ATTEMPTS) {
      // Leave parked for debug inspection; stop hammering.
      continue;
    }
    if (row.id == null) continue;
    try {
      await sendBatch(row.batchId, row.events as TelemetryEvent[], false);
      await db.telemetryPark.delete(row.id);
      patchTelemetryStats({
        flushedEvents:
          getTelemetryStats().flushedEvents +
          (row.events as TelemetryEvent[]).length,
        flushedBatches: getTelemetryStats().flushedBatches + 1,
        lastFlushAt: new Date().toISOString(),
        lastBatchId: row.batchId,
        lastError: null,
        parkedBatches: await db.telemetryPark.count(),
      });
    } catch (err) {
      await db.telemetryPark.update(row.id, {
        attempts: row.attempts + 1,
        lastError: err instanceof Error ? err.message : "replay_failed",
      });
      patchTelemetryStats({
        failedAttempts: getTelemetryStats().failedAttempts + 1,
        lastError: err instanceof Error ? err.message : "replay_failed",
        parkedBatches: await db.telemetryPark.count(),
      });
      break;
    }
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    void flush("visibility");
  }
}

function onPageHide() {
  void flush("unload");
}

function ensureBooted() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageHide);
  void (async () => {
    await db.open();
    patchTelemetryStats({ parkedBatches: await db.telemetryPark.count() });
    await replayParked();
  })();
}

/** Test/demo helper: push a redacted sample and force flush. */
export async function flushNow() {
  await flush("manual");
}

export function getBufferSize() {
  return buffer.length;
}
