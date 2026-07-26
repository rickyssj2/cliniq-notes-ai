import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { useSessionStore } from "@entities/user";
import { queryClient, setActorIdProvider } from "@shared/api";
import { db } from "@shared/db";

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

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DexieBootstrap>{children}</DexieBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
