import type { Context, Next } from "hono";

export type ChaosConfig = {
  /** Always inject latency in [minMs, maxMs]. */
  minLatencyMs: number;
  maxLatencyMs: number;
  /** Probability of a 500 response (0–1). */
  failureRate: number;
  /** Probability of forcing a version conflict on POST versions (0–1). */
  conflictRate: number;
  enabled: boolean;
  /**
   * Demo: fixed delay before every API request is handled (ms).
   * Applied even when `enabled` is false. Runs before the route — so both
   * successful acks and fail-next / chaos rejections are slowed.
   */
  ackDelayMs: number;
};

const config: ChaosConfig = {
  minLatencyMs: 100,
  maxLatencyMs: 800,
  failureRate: 0.05,
  conflictRate: 0.02,
  enabled: process.env.CHAOS !== "0",
  ackDelayMs: 0,
};

/** Deterministic one-shots for demos (not gated by `enabled`). */
const failNext = {
  versions: 0,
  transitions: 0,
  noteGets: 0,
  conflicts: 0,
  telemetry: 0,
};

export function getChaosConfig() {
  return {
    ...config,
    failNext: { ...failNext },
  };
}

export function setChaosConfig(
  patch: Partial<ChaosConfig> & {
    failNext?: Partial<typeof failNext>;
  },
) {
  const { failNext: failPatch, ...rest } = patch;
  Object.assign(config, rest);
  if (typeof config.ackDelayMs === "number") {
    config.ackDelayMs = Math.max(0, Math.min(60_000, config.ackDelayMs));
  }
  if (failPatch) Object.assign(failNext, failPatch);
}

export function shouldForceConflict() {
  if (failNext.conflicts > 0) {
    failNext.conflicts -= 1;
    return true;
  }
  if (!config.enabled) return false;
  return Math.random() < config.conflictRate;
}

export function consumeFailNext(
  kind: "versions" | "transitions" | "noteGets" | "telemetry",
): boolean {
  if (failNext[kind] > 0) {
    failNext[kind] -= 1;
    return true;
  }
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Realistic latency + occasional 500s. Skip for health/dev seed. */
export async function chaosMiddleware(c: Context, next: Next) {
  const path = c.req.path;
  if (
    path === "/api/health" ||
    path.startsWith("/api/dev/") ||
    path.startsWith("/api/telemetry")
  ) {
    return next();
  }

  // Demo delay — before the handler. Slows successful acks and rejections
  // (fail-next / chaos 500) independently of chaos.enabled.
  if (config.ackDelayMs > 0) {
    await sleep(config.ackDelayMs);
  } else if (config.enabled) {
    const latency =
      config.minLatencyMs +
      Math.random() * (config.maxLatencyMs - config.minLatencyMs);
    await sleep(latency);
  } else {
    return next();
  }

  if (
    config.enabled &&
    Math.random() < config.failureRate &&
    c.req.method !== "OPTIONS"
  ) {
    return c.json(
      {
        error: "injected_failure",
        message: "Simulated 500 from chaos middleware",
      },
      500,
    );
  }

  return next();
}
