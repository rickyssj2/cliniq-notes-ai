import { useEffect, useState } from "react";
import { setDevChaos } from "@entities/note";
import { Button } from "@shared/ui/button";
import {
  TOGGLE_DEMO_EVENT,
  useDemoControlsStore,
} from "../model/store";

const DEFAULT_ACK_DELAY_MS = 2000;

/**
 * Floating demo toolbar (DEV). Toggle with `D` or the FAB button.
 * Global: ack delay + arm fail-after-delay (optimistic rollback demos).
 * Page-scoped actions (force conflict, fail-next, throws) register via the store.
 */
export function DemoControlsFab() {
  const open = useDemoControlsStore((s) => s.open);
  const setOpen = useDemoControlsStore((s) => s.setOpen);
  const toggle = useDemoControlsStore((s) => s.toggle);
  const controls = useDemoControlsStore((s) => s.controls);
  const message = useDemoControlsStore((s) => s.message);
  const setMessage = useDemoControlsStore((s) => s.setMessage);

  const [ackDelayDraft, setAckDelayDraft] = useState(String(DEFAULT_ACK_DELAY_MS));
  const [armedKind, setArmedKind] = useState<
    null | "transitions" | "versions"
  >(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onToggle = () => toggle();
    window.addEventListener(TOGGLE_DEMO_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_DEMO_EVENT, onToggle);
  }, [toggle]);

  const parseDelay = () => {
    const n = Number(ackDelayDraft);
    if (!Number.isFinite(n) || n < 0) return DEFAULT_ACK_DELAY_MS;
    return Math.min(60_000, Math.round(n));
  };

  const armDelayedFail = async (kind: "transitions" | "versions") => {
    const ms = parseDelay();
    setBusy(true);
    try {
      await setDevChaos({
        ackDelayMs: ms,
        failNext: {
          transitions: kind === "transitions" ? 1 : 0,
          versions: kind === "versions" ? 1 : 0,
        },
      });
      setArmedKind(kind);
      setMessage(
        kind === "transitions"
          ? `Armed: next transition waits ${ms}ms then 500 — watch optimistic UI, then rollback.`
          : `Armed: next version save waits ${ms}ms then 500 — watch optimistic UI, then rollback.`,
      );
      window.setTimeout(() => {
        setArmedKind((current) => (current === kind ? null : current));
      }, ms + 750);
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to arm delayed fail",
      );
    } finally {
      setBusy(false);
    }
  };

  const clearAckDelay = async () => {
    setBusy(true);
    try {
      await setDevChaos({
        ackDelayMs: 0,
        failNext: { transitions: 0, versions: 0 },
      });
      setArmedKind(null);
      setMessage("Ack delay cleared; fail-next counters reset.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to clear ack delay",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-3 left-3 z-40 flex max-w-[min(100vw-1.5rem,22rem)] flex-col items-start gap-2">
      {open && (
        <div className="w-full space-y-3 rounded-lg border border-(--border) bg-(--card) p-3 text-xs shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold tracking-wide uppercase text-(--muted)">
              Demo controls
            </p>
            <kbd className="rounded border border-(--border) bg-stone-50 px-1.5 py-0.5 font-mono text-[10px]">
              D
            </kbd>
          </div>

          <section className="space-y-2 rounded-md border border-dashed border-(--border) bg-stone-50/80 p-2">
            <p className="font-semibold text-(--foreground)">
              Optimistic rollback
            </p>
            <p className="text-[10px] leading-relaxed text-(--muted)">
              Delay the server ack, then reject — UI patches immediately, then
              rolls back when the 500 lands.
            </p>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-(--muted)">Ack delay (ms)</span>
              <input
                type="number"
                min={0}
                max={60000}
                step={100}
                value={ackDelayDraft}
                onChange={(e) => setAckDelayDraft(e.target.value)}
                className="w-full rounded-md border border-(--border) bg-white px-2 py-1 font-mono text-[11px]"
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={armedKind === "transitions" ? "default" : "outline"}
                className="justify-start"
                disabled={busy}
                onClick={() => void armDelayedFail("transitions")}
              >
                {armedKind === "transitions"
                  ? `Armed: transition fail @ ${parseDelay()}ms`
                  : "Arm: next transition fails after delay"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={armedKind === "versions" ? "default" : "outline"}
                className="justify-start"
                disabled={busy}
                onClick={() => void armDelayedFail("versions")}
              >
                {armedKind === "versions"
                  ? `Armed: version fail @ ${parseDelay()}ms`
                  : "Arm: next version save fails after delay"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                disabled={busy}
                onClick={() => void clearAckDelay()}
              >
                Clear ack delay / fail-next
              </Button>
            </div>
          </section>

          {controls.length === 0 ? (
            <p className="text-(--muted)">
              Open Notes for empty-workspace showcase, or a note for conflict /
              throw demos. Dataset is the API auto-seed (100k).
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="font-semibold tracking-wide uppercase text-(--muted)">
                This page
              </p>
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
