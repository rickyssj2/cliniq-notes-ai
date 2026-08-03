import {
  useConnectivityStore,
  useEffectiveOnline,
  usePendingMutationCount,
} from "@shared/offline";

function formatOfflineAge(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min";
  return `${mins} min`;
}

export function ConnectivityBanner() {
  const online = useEffectiveOnline();
  const pending = usePendingMutationCount();
  const offlineSince = useConnectivityStore((s) => s.offlineSince);

  if (online && pending === 0) return null;

  if (!online) {
    return (
      <div
        role="status"
        className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-950"
      >
        <div className="mx-auto max-w-6xl">
          <span className="font-semibold">Offline</span>
          {offlineSince ? ` · since ${formatOfflineAge(offlineSince)}` : ""}
          {pending > 0
            ? ` · ${pending} pending save${pending === 1 ? "" : "s"} will sync when you’re back`
            : " · edits will queue locally · cached notes stay available"}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-sm text-emerald-950"
    >
      <div className="mx-auto max-w-6xl">
        <span className="font-semibold">Back online</span>
        {" · "}
        syncing {pending} pending save{pending === 1 ? "" : "s"}…
      </div>
    </div>
  );
}
