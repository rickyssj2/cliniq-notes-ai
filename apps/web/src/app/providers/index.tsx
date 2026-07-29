import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, useLocation } from "react-router";
import { useConflictStore } from "@entities/note";
import { useSessionStore } from "@entities/user";
import { queryClient, setActorIdProvider } from "@shared/api";
import { db } from "@shared/db";
import { flush } from "@shared/telemetry";
import { useRealtimeBootstrap } from "@features/realtime-sync";
import { useOfflineBootstrap } from "@features/offline-queue";
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
      <ConflictMergeHost />
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
        <DexieBootstrap>
          <OfflineBootstrap>
            <RealtimeBootstrap>
              <TelemetryBootstrap>{children}</TelemetryBootstrap>
            </RealtimeBootstrap>
          </OfflineBootstrap>
        </DexieBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
