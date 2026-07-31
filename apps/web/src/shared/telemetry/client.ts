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
/** Backoff before retry attempt i+1: 250ms, 500ms, … */
const RETRY_BASE_MS = 250;

let buffer: TelemetryEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let booted = false;

function mintId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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
 * repeated failures; flushes via sendBeacon/keepalive on unload; flushes on
 * route change (session boundary) via callers of `flush("route")`.
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
    await replayParked({ force: reason === "online" || reason === "manual" });
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
    await replayParked({ force: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "flush_failed";
    patchTelemetryStats({ lastError: message });
    // Park only after in-memory retries are exhausted (or single unload attempt).
    await parkBatch(batchId, events, message);
  } finally {
    flushing = false;
  }
}

/** Unload/visibility: one shot. Otherwise retry with exponential backoff before parking. */
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
      if (i < attempts - 1) {
        await sleep(RETRY_BASE_MS * 2 ** i);
      }
    }
  }
  throw lastError ?? new Error("flush_failed");
}

async function sendBatch(
  batchId: string,
  events: TelemetryEvent[],
  unload: boolean,
): Promise<void> {
  // Redact again at send-time so parked/replayed batches never leak PII.
  const safeEvents = events.map((e) => ({
    ...e,
    props: redactProps(e.props),
  }));
  const payload = JSON.stringify({ batchId, events: safeEvents });
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

/**
 * Replay Dexie-parked batches. `force` resets per-row attempt counters so a
 * reconnect (or manual Flush) can drain rows that previously hit the retry cap
 * while the API/chaos was still failing.
 */
async function replayParked(opts: { force?: boolean } = {}) {
  await db.open();
  const rows = await db.telemetryPark.orderBy("createdAt").toArray();
  for (const row of rows) {
    if (row.id == null) continue;

    if (opts.force && row.attempts > 0) {
      await db.telemetryPark.update(row.id, { attempts: 0 });
      row.attempts = 0;
    }

    // Soft cap: skip this pass only (do not abandon forever). Online/manual
    // flush uses force=true and resets attempts first.
    if (!opts.force && row.attempts >= MAX_SEND_ATTEMPTS) {
      continue;
    }

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

function onOnline() {
  void flush("online");
}

function ensureBooted() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("beforeunload", onPageHide);
  window.addEventListener("online", onOnline);
  void (async () => {
    await db.open();
    patchTelemetryStats({ parkedBatches: await db.telemetryPark.count() });
    if (navigator.onLine) {
      await replayParked({ force: true });
    }
  })();
}

/** Test/demo helper: push a redacted sample and force flush. */
export async function flushNow() {
  await flush("manual");
}

export function getBufferSize() {
  return buffer.length;
}
