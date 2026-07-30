import type { ReactNode } from "react";
import {
  ErrorBoundary as RebBoundary,
  type FallbackProps,
} from "react-error-boundary";
import { reportError } from "@shared/errors";
import { Button } from "./button";

type AppErrorBoundaryProps = {
  children: ReactNode;
  /** Where the boundary sits — used in UI + telemetry. */
  label: string;
  /** Remount/reset when these change (e.g. route pathname). */
  resetKeys?: unknown[];
  /** `page` = full-route recovery; `panel` = inline compact. */
  variant?: "page" | "panel";
  fallbackRender?: (props: FallbackProps) => ReactNode;
};

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message || "Unexpected render error";
  if (typeof error === "string") return error;
  return "Unexpected render error";
}

function PageFallback({
  error,
  resetErrorBoundary,
  label,
}: FallbackProps & { label: string }) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-lg space-y-4 px-6 py-16 text-center"
    >
      <p className="text-sm font-medium tracking-[0.16em] text-(--muted) uppercase">
        Something went wrong · {label}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">This view crashed</h1>
      <p className="text-sm text-(--muted)">{errorText(error)}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" size="sm" onClick={resetErrorBoundary}>
          Try again
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            window.location.assign("/notes");
          }}
        >
          Back to notes
        </Button>
      </div>
    </div>
  );
}

function PanelFallback({
  error,
  resetErrorBoundary,
  label,
}: FallbackProps & { label: string }) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-(--danger)/40 bg-red-50/50 p-4"
    >
      <p className="text-sm font-semibold text-(--danger)">
        {label} crashed
      </p>
      <p className="text-xs text-(--muted)">{errorText(error)}</p>
      <Button type="button" size="sm" variant="outline" onClick={resetErrorBoundary}>
        Try again
      </Button>
    </div>
  );
}

/**
 * App wrapper around `react-error-boundary`.
 * Catches render/lifecycle errors only — pair with global + Query reporters.
 */
export function AppErrorBoundary({
  children,
  label,
  resetKeys,
  variant = "page",
  fallbackRender,
}: AppErrorBoundaryProps) {
  return (
    <RebBoundary
      resetKeys={resetKeys}
      onError={(error, info) => {
        reportError({
          source: "render",
          label,
          error,
          componentStack: info.componentStack,
        });
      }}
      fallbackRender={
        fallbackRender ??
        ((props) =>
          variant === "panel" ? (
            <PanelFallback {...props} label={label} />
          ) : (
            <PageFallback {...props} label={label} />
          ))
      }
    >
      {children}
    </RebBoundary>
  );
}

export type { FallbackProps };
