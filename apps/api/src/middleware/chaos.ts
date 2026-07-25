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

export function getChaosConfig() {
  return { ...config };
}

export function setChaosConfig(patch: Partial<ChaosConfig>) {
  Object.assign(config, patch);
}

export function shouldForceConflict() {
  if (!config.enabled) return false;
  return Math.random() < config.conflictRate;
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
