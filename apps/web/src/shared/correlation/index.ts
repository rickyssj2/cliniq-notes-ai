/**
 * Request/action correlation for linking UI → HTTP → telemetry → WS echo.
 * Browser-friendly context (not Node AsyncLocalStorage).
 */

let current: string | null = null;
let lastUsed: string | null = null;

export function mintCorrelationId(prefix = "corr"): string {
  const id = `${prefix}_${crypto.randomUUID()}`;
  lastUsed = id;
  return id;
}

export function getCorrelationId(): string | null {
  return current;
}

/** Most recent id minted/entered — useful for the telemetry debug panel. */
export function getLastCorrelationId(): string | null {
  return lastUsed;
}

export function runWithCorrelation<T>(id: string, fn: () => T): T {
  const prev = current;
  current = id;
  lastUsed = id;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

export async function runWithCorrelationAsync<T>(
  id: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = current;
  current = id;
  lastUsed = id;
  try {
    return await fn();
  } finally {
    current = prev;
  }
}
