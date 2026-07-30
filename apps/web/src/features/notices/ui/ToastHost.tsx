import { useEffect } from "react";
import { Link } from "react-router";
import { useNoticeStore } from "@shared/notices";
import { Button } from "@shared/ui/button";
import { cn } from "@shared/lib";

/** App-shell toasts for remote updates and discarded offline intents. */
export function ToastHost() {
  const items = useNoticeStore((s) => s.items);
  const dismissNotice = useNoticeStore((s) => s.dismissNotice);

  useEffect(() => {
    if (items.length === 0) return;
    const timers = items.map((n) =>
      window.setTimeout(() => dismissNotice(n.id), n.ttlMs),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [items, dismissNotice]);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-60 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {items.map((n) => (
        <div
          key={n.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-lg border px-4 py-3 shadow-lg",
            n.kind === "warning"
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-sky-200 bg-sky-50 text-sky-950",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold">{n.title}</p>
              {n.body ? (
                <p className="text-xs leading-relaxed opacity-90">{n.body}</p>
              ) : null}
              {n.noteId ? (
                <Link
                  to={`/notes/${n.noteId}`}
                  className="inline-block text-xs font-medium underline underline-offset-2"
                >
                  Open note
                </Link>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => dismissNotice(n.id)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
