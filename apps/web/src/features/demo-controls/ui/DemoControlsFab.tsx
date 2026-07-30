import { useEffect } from "react";
import { Button } from "@shared/ui/button";
import {
  TOGGLE_DEMO_EVENT,
  useDemoControlsStore,
} from "../model/store";

/**
 * Floating demo toolbar (DEV). Toggle with `D` or the FAB button.
 * Page-scoped actions (force conflict, fail-next, throws) register via the store.
 * Dataset size comes from API auto-seed (100k); no in-UI reseed.
 */
export function DemoControlsFab() {
  const open = useDemoControlsStore((s) => s.open);
  const setOpen = useDemoControlsStore((s) => s.setOpen);
  const toggle = useDemoControlsStore((s) => s.toggle);
  const controls = useDemoControlsStore((s) => s.controls);
  const message = useDemoControlsStore((s) => s.message);

  useEffect(() => {
    const onToggle = () => toggle();
    window.addEventListener(TOGGLE_DEMO_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_DEMO_EVENT, onToggle);
  }, [toggle]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-3 left-3 z-40 flex max-w-[min(100vw-1.5rem,22rem)] flex-col items-start gap-2">
      {open && (
        <div className="w-full space-y-2 rounded-lg border border-(--border) bg-(--card) p-3 text-xs shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold tracking-wide uppercase text-(--muted)">
              Demo controls
            </p>
            <kbd className="rounded border border-(--border) bg-stone-50 px-1.5 py-0.5 font-mono text-[10px]">
              D
            </kbd>
          </div>

          {controls.length === 0 ? (
            <p className="text-(--muted)">
              Open Notes for empty-workspace showcase, or a note for conflict /
              fail-next / boundary throws. Dataset is the API auto-seed (100k).
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {controls.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={c.active ? "default" : "outline"}
                  className="justify-start"
                  onClick={c.onClick}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          )}

          {message && <p className="text-(--muted)">{message}</p>}
          <p className="text-[10px] text-(--muted)">
            DevTools → Network → Offline for queue demos. Press{" "}
            <kbd className="font-mono">D</kbd> to hide ·{" "}
            <kbd className="font-mono">T</kbd> telemetry.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-full border border-(--border) bg-(--card) px-3 py-1.5 text-[11px] font-medium shadow-sm hover:bg-stone-50"
        title="Demo controls (D)"
      >
        {open ? "Hide demo" : "Demo · D"}
      </button>
    </div>
  );
}
