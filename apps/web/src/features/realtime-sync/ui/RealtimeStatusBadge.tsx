import { useConnectionStatus } from "../model/hooks";

const LABELS: Record<string, string> = {
  idle: "WS idle",
  connecting: "Connecting…",
  open: "Live",
  reconnecting: "Reconnecting…",
  closed: "WS off",
};

export function RealtimeStatusBadge() {
  const status = useConnectionStatus();
  const live = status === "open";
  const warn = status === "reconnecting" || status === "connecting";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        live
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : warn
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
      }`}
      title="WebSocket connection"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          live ? "bg-emerald-500" : warn ? "bg-amber-500 animate-pulse" : "bg-stone-400"
        }`}
      />
      {LABELS[status] ?? status}
    </span>
  );
}
