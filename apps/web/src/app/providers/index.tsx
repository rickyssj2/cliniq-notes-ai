import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { useSessionStore } from "@entities/user";
import { queryClient, setActorIdProvider } from "@shared/api";
import { db } from "@shared/db";
import { flush } from "@shared/telemetry";
import { useRealtimeBootstrap } from "@features/realtime-sync";
import { useOfflineBootstrap } from "@features/offline-queue";
import { ConflictMergeHost } from "@features/resolve-conflict";
import {
  TelemetryDebugPanel,
  useTelemetryPageViews,
} from "@features/telemetry-debug";

type AppProvidersProps = {
  children: ReactNode;
};

setActorIdProvider(() => useSessionStore.getState().actor.id);

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
      <TelemetryDebugPanel />
    </>
  );
}

function RealtimeBootstrap({ children }: { children: ReactNode }) {
  useRealtimeBootstrap();
  return (
    <>
      {children}
      <ConflictMergeHost />
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
