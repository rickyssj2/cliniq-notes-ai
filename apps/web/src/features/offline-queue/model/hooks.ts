import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@shared/db";
import { realtimeClient } from "@shared/realtime";
import {
  recoverInFlightMutations,
  useConnectivityStore,
  useEffectiveOnline,
} from "@shared/offline";
import { drainMutationQueue } from "./drain";

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
      if (useConnectivityStore.getState().browserOnline) {
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
