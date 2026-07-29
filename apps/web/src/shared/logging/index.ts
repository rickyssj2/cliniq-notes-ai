import { getCorrelationId } from "@shared/correlation";

type LogExtra = Record<string, unknown>;

function emit(
  level: "info" | "warn" | "error",
  message: string,
  extra: LogExtra = {},
) {
  const entry = {
    level,
    message,
    correlationId: getCorrelationId(),
    at: new Date().toISOString(),
    ...extra,
  };
  // Structured shape in every environment; verbose console only in DEV.
  if (import.meta.env.DEV) {
    const fn =
      level === "info" ? console.log : level === "warn" ? console.warn : console.error;
    fn(`[log:${level}]`, message, entry);
  }
  return entry;
}

/** Tiny structured logger — same correlation field as telemetry/HTTP. */
export const log = {
  info: (message: string, extra?: LogExtra) => emit("info", message, extra),
  warn: (message: string, extra?: LogExtra) => emit("warn", message, extra),
  error: (message: string, extra?: LogExtra) => emit("error", message, extra),
};
