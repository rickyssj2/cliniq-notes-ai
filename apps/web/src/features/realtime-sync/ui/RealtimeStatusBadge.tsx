import type { ConnectionStatus } from "@shared/realtime";
import { useConnectionStatus } from "../model/hooks";

type Props = {
  /** Same source as ConnectivityBanner (`navigator.onLine`). */
  online: boolean;
};

export function RealtimeStatusBadge({ online }: Props) {
  const wsStatus = useConnectionStatus();

  if (!online) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900"
        title="Browser reports offline"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Offline
      </span>
    );
  }

  const live = wsStatus === "open";
  const warn = wsStatus === "reconnecting" || wsStatus === "connecting";
  const label = labelFor(wsStatus);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        live
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : warn
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-(--border) bg-(--card) text-(--muted)"
      }`}
      title="WebSocket connection"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          live
            ? "bg-emerald-500"
            : warn
              ? "bg-amber-500 animate-pulse"
              : "bg-stone-400"
        }`}
      />
      {label}
    </span>
  );
}

function labelFor(status: ConnectionStatus): string {
  switch (status) {
    case "idle":
      return "WS idle";
    case "connecting":
      return "Connecting…";
    case "open":
      return "Live";
    case "reconnecting":
      return "Reconnecting…";
    case "closed":
      return "WS off";
  }
}
