import { useEffect, useState, useSyncExternalStore } from "react";
import { useConnectivityStore } from "./connectivity-store";
import {
  countPendingMutations,
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
