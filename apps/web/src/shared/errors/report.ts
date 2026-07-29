import { track } from "@shared/telemetry";
import { getCorrelationId } from "@shared/correlation";
import { ApiError } from "@shared/api/http";

export type ErrorSource =
  | "render"
  | "window"
  | "unhandledrejection"
  | "query"
  | "mutation";

type ReportInput = {
  source: ErrorSource;
  error: unknown;
  label?: string;
  /** React component stack — never include user content. */
  componentStack?: string | null;
};

function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "Unknown";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  if (typeof error === "string") return error.slice(0, 200);
  return "unknown_error";
}

/**
 * Single funnel for render + global + Query errors → telemetry.
 * Props stay free of clinical text (message truncated; no stacks with PHI).
 */
export function reportError(input: ReportInput) {
  const { source, error, label, componentStack } = input;
  const status = error instanceof ApiError ? error.status : undefined;
  const correlationId = getCorrelationId();

  console.error(`[error:${source}]`, label ?? "", error, componentStack ?? "");

  track(
    "ui.error",
    {
      source,
      label: label ?? null,
      name: errorName(error),
      message: errorMessage(error),
      status: status ?? null,
      hasComponentStack: Boolean(componentStack),
      ...(correlationId ? { correlationId } : {}),
    },
    { important: true },
  );
}
