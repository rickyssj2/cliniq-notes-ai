import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@shared/db";
import { realtimeClient } from "@shared/realtime";
import { useConnectivityStore } from "./connectivity-store";
import { drainMutationQueue } from "./drain";
import {
  countPendingMutations,
  recoverInFlightMutations,
  subscribeQueueStats,
} from "./mutation-queue";

function subscribeConnectivity(cb: () => void) {
  return useConnectivityStore.subscribe(cb);
}

function getBrowserOnline() {
  return useConnectivityStore.getState().browserOnline;
}

export function useEffectiveOnline(): boolean {
  return useSyncExternalStore(
    subscribeConnectivity,
    getBrowserOnline,
    () => true,
  );
}

export function usePendingMutationCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void countPendingMutations().then((n) => {
        if (alive) setCount(n);
      });
    };
    refresh();
    const unsub = subscribeQueueStats(refresh);
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return count;
}

/** Browser online/offline + Dexie recover + drain on reconnect + pause WS. */
export function useOfflineBootstrap() {
  const queryClient = useQueryClient();
  const setBrowserOnline = useConnectivityStore((s) => s.setBrowserOnline);
  const online = useEffectiveOnline();

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    setBrowserOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [setBrowserOnline]);

  useEffect(() => {
    void (async () => {
      await db.open();
      await recoverInFlightMutations();
      if (getBrowserOnline()) {
        await drainMutationQueue(queryClient);
      }
    })();
  }, [queryClient]);

  useEffect(() => {
    if (!online) {
      realtimeClient.disconnect();
      return;
    }
    realtimeClient.connect();
    void drainMutationQueue(queryClient);
  }, [online, queryClient]);
}
