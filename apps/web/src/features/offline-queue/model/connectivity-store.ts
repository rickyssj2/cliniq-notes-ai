import { create } from "zustand";

type ConnectivityState = {
  /** Browser online event (may be wrong behind captive portals). */
  browserOnline: boolean;
  offlineSince: string | null;
  setBrowserOnline: (online: boolean) => void;
};

function nextOfflineSince(
  online: boolean,
  prev: string | null,
): string | null {
  if (online) return null;
  return prev ?? new Date().toISOString();
}

export const useConnectivityStore = create<ConnectivityState>((set, get) => ({
  browserOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  offlineSince:
    typeof navigator !== "undefined" && !navigator.onLine
      ? new Date().toISOString()
      : null,

  setBrowserOnline: (browserOnline) => {
    set({
      browserOnline,
      offlineSince: nextOfflineSince(browserOnline, get().offlineSince),
    });
  },
}));

export function isEffectivelyOnline(): boolean {
  return useConnectivityStore.getState().browserOnline;
}

/** Offline duration in ms, or 0 if online. */
export function offlineDurationMs(now = Date.now()): number {
  const since = useConnectivityStore.getState().offlineSince;
  if (!since) return 0;
  return Math.max(0, now - Date.parse(since));
}
