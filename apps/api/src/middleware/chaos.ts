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
};

const config: ChaosConfig = {
  minLatencyMs: 100,
  maxLatencyMs: 800,
  failureRate: 0.05,
  conflictRate: 0.02,
  enabled: process.env.CHAOS !== "0",
};

/** Deterministic one-shots for demos (not gated by `enabled`). */
const failNext = {
  versions: 0,
  transitions: 0,
  noteGets: 0,
  conflicts: 0,
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
  kind: "versions" | "transitions" | "noteGets",
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
    !config.enabled ||
    path === "/api/health" ||
    path.startsWith("/api/dev/")
  ) {
    return next();
  }

  const latency =
    config.minLatencyMs +
    Math.random() * (config.maxLatencyMs - config.minLatencyMs);
  await sleep(latency);

  if (Math.random() < config.failureRate && c.req.method !== "OPTIONS") {
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
