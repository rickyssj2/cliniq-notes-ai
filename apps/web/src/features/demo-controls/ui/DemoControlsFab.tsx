import { useEffect, useState } from "react";
import {
  duplicateLastRealtimeEvent,
  fetchDevChaos,
  setDevChaos,
} from "@entities/note";
import { useSessionStore } from "@entities/user";
import { ApiError } from "@shared/api";
import { config } from "@shared/config";
import { Button } from "@shared/ui/button";
import {
  TOGGLE_DEMO_EVENT,
  useDemoControlsStore,
} from "../model/store";

const DEFAULT_ACK_DELAY_MS = 2000;
const MAX_ACK_DELAY_MS = 60_000;

function noteIdFromPath(): string | undefined {
  const m = window.location.pathname.match(/^\/notes\/([^/]+)/);
  return m?.[1];
}

async function probeNotesAuth(authorization?: string, extra?: HeadersInit) {
  const headers: Record<string, string> = {
    ...(extra as Record<string, string> | undefined),
  };
  if (authorization !== undefined) {
    headers.Authorization = authorization;
  }
  const res = await fetch(`${config.apiBaseUrl}/notes?limit=1`, { headers });
  let reason = "";
  try {
    const body = (await res.json()) as { reason?: string; error?: string };
    reason = body.reason ?? body.error ?? "";
  } catch {
    /* ignore */
  }
  return { status: res.status, reason };
}

/**
 * Floating demo toolbar (DEV). Toggle with `D` or the FAB button.
 * Global: server delay (all responses) + optional fail-next, independently.
 * Page-scoped actions register via the store.
 */
export function DemoControlsFab() {
  const open = useDemoControlsStore((s) => s.open);
  const setOpen = useDemoControlsStore((s) => s.setOpen);
  const toggle = useDemoControlsStore((s) => s.toggle);
  const controls = useDemoControlsStore((s) => s.controls);
  const message = useDemoControlsStore((s) => s.message);
  const setMessage = useDemoControlsStore((s) => s.setMessage);

  const [ackDelayDraft, setAckDelayDraft] = useState(
    String(DEFAULT_ACK_DELAY_MS),
  );
  /** Last delay successfully applied on the API (0 = off). */
  const [activeDelayMs, setActiveDelayMs] = useState(0);
  const [armedKind, setArmedKind] = useState<
    null | "transitions" | "versions"
  >(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onToggle = () => toggle();
    window.addEventListener(TOGGLE_DEMO_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_DEMO_EVENT, onToggle);
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    void fetchDevChaos()
      .then((cfg) => {
        setActiveDelayMs(cfg.ackDelayMs);
        if (cfg.ackDelayMs > 0) {
          setAckDelayDraft(String(cfg.ackDelayMs));
        }
        if (cfg.failNext.transitions > 0) setArmedKind("transitions");
        else if (cfg.failNext.versions > 0) setArmedKind("versions");
        else setArmedKind(null);
      })
      .catch(() => {
        /* ignore — panel still usable */
      });
  }, [open]);

  const parseDelay = () => {
    const n = Number(ackDelayDraft);
    if (!Number.isFinite(n) || n < 0) return DEFAULT_ACK_DELAY_MS;
    return Math.min(MAX_ACK_DELAY_MS, Math.round(n));
  };

  const applyServerDelay = async () => {
    const ms = parseDelay();
    setBusy(true);
    try {
      await setDevChaos({ ackDelayMs: ms });
      setActiveDelayMs(ms);
      setMessage(
        ms > 0
          ? `Server delay ${ms}ms armed — every API response (acks and rejections) waits before the handler runs.`
          : "Server delay cleared.",
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to apply server delay",
      );
    } finally {
      setBusy(false);
    }
  };

  const clearServerDelay = async () => {
    setBusy(true);
    try {
      await setDevChaos({ ackDelayMs: 0 });
      setActiveDelayMs(0);
      setMessage("Server delay cleared (fail-next unchanged).");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to clear server delay",
      );
    } finally {
      setBusy(false);
    }
  };

  const armFailNext = async (kind: "transitions" | "versions") => {
    setBusy(true);
    try {
      await setDevChaos({
        failNext: {
          transitions: kind === "transitions" ? 1 : 0,
          versions: kind === "versions" ? 1 : 0,
        },
      });
      setArmedKind(kind);
      const delayHint =
        activeDelayMs > 0
          ? ` after the armed ${activeDelayMs}ms server delay`
          : " immediately (no server delay armed)";
      setMessage(
        kind === "transitions"
          ? `Armed: next transition → 500${delayHint}.`
          : `Armed: next version save → 500${delayHint}.`,
      );
      window.setTimeout(
        () => {
          setArmedKind((current) => (current === kind ? null : current));
        },
        activeDelayMs + 750,
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to arm fail-next",
      );
    } finally {
      setBusy(false);
    }
  };

  const clearFailNext = async () => {
    setBusy(true);
    try {
      await setDevChaos({
        failNext: { transitions: 0, versions: 0, conflicts: 0 },
      });
      setArmedKind(null);
      setMessage("Fail-next counters cleared (server delay unchanged).");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Failed to clear fail-next",
      );
    } finally {
      setBusy(false);
    }
  };

  const resendDuplicateWs = async () => {
    setBusy(true);
    try {
      const noteId = noteIdFromPath();
      const result = await duplicateLastRealtimeEvent(noteId);
      setMessage(
        result.recipients === 0
          ? `Resent ${result.type} (${result.eventId}) for ${result.noteId}, but 0 sockets were subscribed — stay on the note detail with Live WS.`
          : `Resent duplicate ${result.type} · eventId ${result.eventId} → ${result.recipients} socket(s). Watch for “WS duplicate dropped” toast on every subscribed tab.`,
      );
    } catch (err) {
      const reason =
        err instanceof ApiError &&
        typeof err.body === "object" &&
        err.body !== null &&
        "reason" in err.body &&
        typeof (err.body as { reason?: unknown }).reason === "string"
          ? (err.body as { reason: string }).reason
          : err instanceof Error
            ? err.message
            : "No event to duplicate — save or transition a note first.";
      setMessage(reason);
    } finally {
      setBusy(false);
    }
  };

  /** Prove notes API rejects missing/forged tokens and accepts the session JWT. */
  const showcaseJwtAuth = async () => {
    setBusy(true);
    try {
      const sessionToken = useSessionStore.getState().accessToken;
      const lines: string[] = [];

      const missing = await probeNotesAuth();
      lines.push(
        `1) No Authorization → ${missing.status}${missing.reason ? ` (${missing.reason})` : ""}`,
      );

      const invalid = await probeNotesAuth("Bearer not.a.valid.jwt");
      lines.push(
        `2) Invalid Bearer → ${invalid.status}${invalid.reason ? ` (${invalid.reason})` : ""}`,
      );

      const headerOnly = await probeNotesAuth(undefined, {
        "X-Actor-Id": "usr_adm_001",
      });
      lines.push(
        `3) X-Actor-Id only (forged, no Bearer) → ${headerOnly.status}${headerOnly.reason ? ` (${headerOnly.reason})` : ""}`,
      );

      let validStatus = 0;
      if (!sessionToken) {
        lines.push("4) Valid session JWT → skipped (no token in session)");
      } else {
        const valid = await probeNotesAuth(`Bearer ${sessionToken}`);
        validStatus = valid.status;
        lines.push(
          `4) Valid session JWT → ${valid.status}${valid.status === 200 ? " (ok)" : valid.reason ? ` (${valid.reason})` : ""}`,
        );
      }

      const ok =
        missing.status === 401 &&
        invalid.status === 401 &&
        headerOnly.status === 401 &&
        validStatus === 200;

      setMessage(
        `${ok ? "JWT demo passed." : "JWT demo unexpected results."}\n${lines.join("\n")}`,
      );
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "JWT showcase failed",
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
            <p className="font-semibold text-(--foreground)">Server delay</p>
            <p className="text-[10px] leading-relaxed text-(--muted)">
              Armed separately from fail-next. Holds every API request before
              the handler — slows successful acks and rejections alike.
            </p>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-(--muted)">Delay (ms)</span>
              <input
                type="number"
                min={0}
                max={MAX_ACK_DELAY_MS}
                step={100}
                value={ackDelayDraft}
                onChange={(e) => setAckDelayDraft(e.target.value)}
                className="w-full rounded-md border border-(--border) bg-white px-2 py-1 font-mono text-[11px]"
              />
            </label>
            <p className="font-mono text-[10px] text-(--muted)">
              Active:{" "}
              {activeDelayMs > 0 ? `${activeDelayMs}ms` : "off"}
            </p>
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={activeDelayMs > 0 ? "default" : "outline"}
                className="justify-start"
                disabled={busy}
                onClick={() => void applyServerDelay()}
              >
                {activeDelayMs > 0
                  ? `Update delay → ${parseDelay()}ms`
                  : `Apply delay (${parseDelay()}ms)`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                disabled={busy || activeDelayMs === 0}
                onClick={() => void clearServerDelay()}
              >
                Clear server delay
              </Button>
            </div>
          </section>

          <section className="space-y-2 rounded-md border border-dashed border-(--border) bg-stone-50/80 p-2">
            <p className="font-semibold text-(--foreground)">Fail-next</p>
            <p className="text-[10px] leading-relaxed text-(--muted)">
              One-shot 500 after the (optional) armed delay — use with delay to
              watch optimistic UI then rollback.
            </p>
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={armedKind === "transitions" ? "default" : "outline"}
                className="justify-start"
                disabled={busy}
                onClick={() => void armFailNext("transitions")}
              >
                {armedKind === "transitions"
                  ? "Armed: next transition → 500"
                  : "Arm: next transition → 500"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={armedKind === "versions" ? "default" : "outline"}
                className="justify-start"
                disabled={busy}
                onClick={() => void armFailNext("versions")}
              >
                {armedKind === "versions"
                  ? "Armed: next version save → 500"
                  : "Arm: next version save → 500"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="justify-start"
                disabled={busy}
                onClick={() => void clearFailNext()}
              >
                Clear fail-next
              </Button>
            </div>
          </section>

          <section className="space-y-2 rounded-md border border-dashed border-(--border) bg-stone-50/80 p-2">
            <p className="font-semibold text-(--foreground)">Auth (JWT)</p>
            <p className="text-[10px] leading-relaxed text-(--muted)">
              Notes API requires a server-minted Bearer token. Missing/invalid
              tokens and bare <code className="font-mono">X-Actor-Id</code>{" "}
              get 401; the session JWT succeeds.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="justify-start"
              disabled={busy}
              onClick={() => void showcaseJwtAuth()}
            >
              Showcase invalid vs valid token
            </Button>
          </section>

          <section className="space-y-2 rounded-md border border-dashed border-(--border) bg-stone-50/80 p-2">
            <p className="font-semibold text-(--foreground)">Realtime</p>
            <p className="text-[10px] leading-relaxed text-(--muted)">
              Re-send the last logged WS event with the same{" "}
              <code className="font-mono">eventId</code> (at-least-once). Every
              subscribed tab should toast “WS duplicate dropped” and skip a
              second patch. Open a note detail (Live) and save/transition first.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="justify-start"
              disabled={busy}
              onClick={() => void resendDuplicateWs()}
            >
              Resend last WS event (duplicate eventId)
            </Button>
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

          {message && (
            <p className="whitespace-pre-wrap text-(--muted)">{message}</p>
          )}
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
