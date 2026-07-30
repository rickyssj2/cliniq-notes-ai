import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, useLocation } from "react-router";
import { useConflictStore } from "@entities/note";
import { useSessionStore } from "@entities/user";
import { queryClient, setActorIdProvider } from "@shared/api";
import { db } from "@shared/db";
import { installGlobalErrorHandlers } from "@shared/errors";
import { flush } from "@shared/telemetry";
import { AppErrorBoundary } from "@shared/ui/error-boundary";
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

const ConflictMergeHost = lazy(() =>
  import("@features/resolve-conflict/ui/ConflictMergeHost").then((m) => ({
    default: m.ConflictMergeHost,
  })),
);

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
 * Defer conflict UI chunk until note detail (or an open conflict).
 * Keeps /notes list free of merge-modal / word-diff code.
 */
function ConflictHostGate() {
  const location = useLocation();
  const conflictOpen = useConflictStore((s) => Boolean(s.open));
  const onNoteDetail = /^\/notes\/[^/]+/.test(location.pathname);

  if (!onNoteDetail && !conflictOpen) return null;

  return (
    <Suspense fallback={null}>
      <AppErrorBoundary label="conflict-host" variant="panel">
        <ConflictMergeHost />
      </AppErrorBoundary>
    </Suspense>
  );
}

function RealtimeBootstrap({ children }: { children: ReactNode }) {
  useRealtimeBootstrap();
  return (
    <>
      {children}
      <ConflictHostGate />
    </>
  );
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorReportingBootstrap>
          <DexieBootstrap>
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
          </DexieBootstrap>
        </ErrorReportingBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
