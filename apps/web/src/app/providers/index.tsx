import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, useLocation } from "react-router";
import { useConflictStore } from "@entities/note";
import {
  ensureAccessToken,
  useSessionStore,
} from "@entities/user";
import {
  queryClient,
  setAccessTokenProvider,
  setActorIdProvider,
} from "@shared/api";
import { db } from "@shared/db";
import { installGlobalErrorHandlers } from "@shared/errors";
import { flush } from "@shared/telemetry";
import { AppErrorBoundary } from "@shared/ui/error-boundary";
import { ConflictMergeHost } from "@features/resolve-conflict";
import { ToastHost } from "@features/notices";
import { useRealtimeBootstrap } from "@features/realtime-sync";
import { useOfflineBootstrap } from "@features/offline-queue";
import { KeyboardShortcutsHost } from "@features/keyboard-shortcuts";
import { DemoControlsFab } from "@features/demo-controls";
// Deep import so the debug panel stays out of the eager telemetry chunk.
import { useTelemetryPageViews } from "@features/telemetry-debug/model/use-page-views";

type AppProvidersProps = {
  children: ReactNode;
};

setActorIdProvider(() => useSessionStore.getState().actor.id);
setAccessTokenProvider(() => useSessionStore.getState().accessToken);

const TelemetryDebugPanel = lazy(() =>
  import("@features/telemetry-debug/ui/TelemetryDebugPanel").then((m) => ({
    default: m.TelemetryDebugPanel,
  })),
);

function DexieBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    void db.open().catch((err: unknown) => {
      console.error("[dexie] failed to open", err);
    });
  }, []);
  return children;
}

/** Mint/refresh demo JWT before notes API calls (Bearer required). */
function AuthBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void ensureAccessToken({ force: true })
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to mint token");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-(--muted)">
        Auth bootstrap failed: {error}. Is the API running?
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-(--muted)">
        Signing in…
      </div>
    );
  }
  return children;
}

function OfflineBootstrap({ children }: { children: ReactNode }) {
  useOfflineBootstrap();
  return children;
}

function ErrorReportingBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);
  return children;
}

function TelemetryBootstrap({ children }: { children: ReactNode }) {
  useTelemetryPageViews();
  useEffect(() => {
    void flush("boot");
  }, []);
  return (
    <>
      {children}
      {import.meta.env.DEV ? (
        <Suspense fallback={null}>
          <TelemetryDebugPanel />
        </Suspense>
      ) : null}
    </>
  );
}

/**
 * Mount conflict UI on note detail (or when a conflict is already open).
 * Eager import — lazy chunks fail offline when the network can't fetch the
 * resolve-conflict module after navigating to a detail page.
 */
function ConflictHostGate() {
  const location = useLocation();
  const conflictOpen = useConflictStore((s) => Boolean(s.open));
  const onNoteDetail = /^\/notes\/[^/]+/.test(location.pathname);

  if (!onNoteDetail && !conflictOpen) return null;

  return (
    <AppErrorBoundary label="conflict-host" variant="panel">
      <ConflictMergeHost />
    </AppErrorBoundary>
  );
}

function RealtimeBootstrap({ children }: { children: ReactNode }) {
  useRealtimeBootstrap();
  return (
    <>
      {children}
      <ConflictHostGate />
      <ToastHost />
    </>
  );
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorReportingBootstrap>
          <DexieBootstrap>
            <AuthBootstrap>
              <OfflineBootstrap>
                <RealtimeBootstrap>
                  <TelemetryBootstrap>
                    <AppErrorBoundary label="app" variant="page">
                      {children}
                    </AppErrorBoundary>
                    <KeyboardShortcutsHost />
                    <DemoControlsFab />
                  </TelemetryBootstrap>
                </RealtimeBootstrap>
              </OfflineBootstrap>
            </AuthBootstrap>
          </DexieBootstrap>
        </ErrorReportingBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
