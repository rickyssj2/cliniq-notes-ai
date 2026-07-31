import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
const TIP_WIDTH_PX = 224; // w-56

type SectionId =
  | "delay"
  | "fail"
  | "auth"
  | "realtime"
  | "page";

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

/** Click-to-toggle info popover — portaled so overflow on the FAB can't clip it. */
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, r.right - TIP_WIDTH_PX),
        window.innerWidth - TIP_WIDTH_PX - 8,
      );
      const below = r.bottom + 6;
      const tipH = tipRef.current?.offsetHeight ?? 80;
      const top =
        below + tipH > window.innerHeight - 8
          ? Math.max(8, r.top - tipH - 6)
          : below;
      setPos({ top, left });
    };
    place();
    requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || tipRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-(--border) text-[11px] font-semibold text-(--muted) hover:bg-stone-100"
        aria-label="Section info"
        aria-expanded={open}
        aria-controls={tipId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open &&
        createPortal(
          <span
            ref={tipRef}
            id={tipId}
            role="tooltip"
            style={
              pos
                ? { top: pos.top, left: pos.left, width: TIP_WIDTH_PX }
                : { top: 0, left: 0, width: TIP_WIDTH_PX, visibility: "hidden" }
            }
            className="fixed z-[200] rounded-md border border-(--border) bg-white p-2.5 text-xs leading-relaxed font-normal text-(--muted) shadow-md"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}

function DemoSection({
  id,
  title,
  hint,
  badge,
  active = false,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  hint: string;
  badge?: string;
  /** Section has an armed/live demo (delay, fail-next, page toggle, …). */
  active?: boolean;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-md border bg-stone-50/80 ${
        active
          ? "border-teal-500/70 bg-teal-50/60"
          : "border-(--border)"
      }`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left"
        aria-expanded={open}
        onClick={() => onToggle(id)}
      >
        <span
          className="font-mono text-xs text-(--muted)"
          aria-hidden
        >
          {open ? "▾" : "▸"}
        </span>
        {active ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-teal-600"
            title="Active"
            aria-hidden
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-(--foreground)">
          {title}
        </span>
        {badge ? (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] ${
              active
                ? "bg-teal-600 text-white"
                : "bg-stone-200/80 text-(--muted)"
            }`}
          >
            {badge}
          </span>
        ) : null}
        <InfoTip text={hint} />
      </button>
      {open ? <div className="space-y-2 px-2.5 pb-2.5">{children}</div> : null}
    </section>
  );
}

/**
 * Floating demo toolbar (DEV). Toggle with `D` or the FAB button.
 * Sections collapse; copy lives in click-to-open info tips.
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
  const [activeDelayMs, setActiveDelayMs] = useState(0);
  const [armedKind, setArmedKind] = useState<
    null | "transitions" | "versions"
  >(null);
  const [busy, setBusy] = useState(false);
  /** Accordion: one section open at a time to keep the FAB short. */
  const [openSection, setOpenSection] = useState<SectionId | null>(
    controls.length > 0 ? "page" : "delay",
  );

  useEffect(() => {
    const onToggle = () => toggle();
    window.addEventListener(TOGGLE_DEMO_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_DEMO_EVENT, onToggle);
  }, [toggle]);

  useEffect(() => {
    if (!open) return;

    const syncChaos = () => {
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
    };

    syncChaos();
    // Keep armed badges in sync if another tab clears/arms fail latches.
    const id = window.setInterval(syncChaos, 2000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (controls.length > 0) setOpenSection("page");
  }, [controls.length]);

  const toggleSection = (id: SectionId) => {
    setOpenSection((cur) => (cur === id ? null : id));
  };

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
          ? `Server delay ${ms}ms armed — every API response waits before the handler.`
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
      setMessage("Server delay cleared.");
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
          ? ` after ${activeDelayMs}ms delay`
          : " immediately";
      setMessage(
        kind === "transitions"
          ? `Armed: all transitions → 500${delayHint} until cleared.`
          : `Armed: all version saves → 500${delayHint} until cleared.`,
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
      setMessage("Fail-next cleared.");
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
          ? `Resent ${result.type} (${result.eventId}) — 0 sockets subscribed.`
          : `Resent duplicate ${result.type} · ${result.eventId} → ${result.recipients} socket(s).`,
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
            : "No event to duplicate — save or transition first.";
      setMessage(reason);
    } finally {
      setBusy(false);
    }
  };

  const showcaseJwtAuth = async () => {
    setBusy(true);
    try {
      const sessionToken = useSessionStore.getState().accessToken;
      const lines: string[] = [];

      const missing = await probeNotesAuth();
      lines.push(
        `1) No auth → ${missing.status}${missing.reason ? ` (${missing.reason})` : ""}`,
      );

      const invalid = await probeNotesAuth("Bearer not.a.valid.jwt");
      lines.push(
        `2) Invalid → ${invalid.status}${invalid.reason ? ` (${invalid.reason})` : ""}`,
      );

      const headerOnly = await probeNotesAuth(undefined, {
        "X-Actor-Id": "usr_adm_001",
      });
      lines.push(
        `3) X-Actor-Id only → ${headerOnly.status}${headerOnly.reason ? ` (${headerOnly.reason})` : ""}`,
      );

      let validStatus = 0;
      if (!sessionToken) {
        lines.push("4) Valid JWT → skipped (no session token)");
      } else {
        const valid = await probeNotesAuth(`Bearer ${sessionToken}`);
        validStatus = valid.status;
        lines.push(
          `4) Valid JWT → ${valid.status}${valid.status === 200 ? " (ok)" : valid.reason ? ` (${valid.reason})` : ""}`,
        );
      }

      const ok =
        missing.status === 401 &&
        invalid.status === 401 &&
        headerOnly.status === 401 &&
        validStatus === 200;

      setMessage(
        `${ok ? "JWT demo passed." : "JWT demo unexpected."}\n${lines.join("\n")}`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "JWT showcase failed");
    } finally {
      setBusy(false);
    }
  };

  if (!import.meta.env.DEV) return null;

  const delayActive = activeDelayMs > 0;
  const failActive = armedKind !== null;
  const pageActive = controls.some((c) => c.active);
  const anyArmed = delayActive || failActive || pageActive;

  return (
    <div className="fixed bottom-3 left-3 z-40 flex max-w-[min(100vw-1.5rem,22rem)] flex-col items-start gap-2">
      {open && (
        <div className="flex max-h-[min(70vh,32rem)] w-full flex-col overflow-hidden rounded-lg border border-(--border) bg-(--card) text-sm shadow-lg">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-(--border) px-3 py-2">
            <p className="text-xs font-semibold tracking-wide uppercase text-(--muted)">
              Demo
            </p>
            <span className="text-xs text-(--muted)">
              <kbd className="rounded border border-(--border) bg-stone-50 px-1.5 font-mono text-[11px]">
                D
              </kbd>
              {" · "}
              <kbd className="rounded border border-(--border) bg-stone-50 px-1.5 font-mono text-[11px]">
                T
              </kbd>{" "}
              telemetry
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
            <DemoSection
              id="delay"
              title="Server delay"
              hint="Armed separately from fail-next. Holds every API request before the handler — slows successful acks and rejections alike."
              badge={delayActive ? `${activeDelayMs}ms` : "off"}
              active={delayActive}
              open={openSection === "delay"}
              onToggle={toggleSection}
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={MAX_ACK_DELAY_MS}
                  step={100}
                  aria-label="Delay milliseconds"
                  value={ackDelayDraft}
                  onChange={(e) => setAckDelayDraft(e.target.value)}
                  className="w-full rounded-md border border-(--border) bg-white px-2.5 py-1.5 font-mono text-sm"
                />
                <span className="shrink-0 text-xs text-(--muted)">ms</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={delayActive ? "default" : "outline"}
                  className="h-9 justify-start text-sm"
                  disabled={busy}
                  onClick={() => void applyServerDelay()}
                >
                  {delayActive
                    ? `Update delay → ${parseDelay()}ms`
                    : `Apply delay (${parseDelay()}ms)`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 justify-start text-sm"
                  disabled={busy || !delayActive}
                  onClick={() => void clearServerDelay()}
                >
                  Clear server delay
                </Button>
              </div>
            </DemoSection>

            <DemoSection
              id="fail"
              title="Fail-next"
              hint="While armed, every matching request returns 500 (sticky until Clear). Pair with server delay to watch optimistic UI then rollback on each attempt."
              badge={
                armedKind === "transitions"
                  ? "txn"
                  : armedKind === "versions"
                    ? "ver"
                    : "off"
              }
              active={failActive}
              open={openSection === "fail"}
              onToggle={toggleSection}
            >
              <div className="flex flex-col gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={armedKind === "transitions" ? "default" : "outline"}
                  className="h-9 justify-start text-sm"
                  disabled={busy}
                  onClick={() => void armFailNext("transitions")}
                >
                  {armedKind === "transitions"
                    ? "Armed: all transitions → 500"
                    : "Arm: fail all transitions"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={armedKind === "versions" ? "default" : "outline"}
                  className="h-9 justify-start text-sm"
                  disabled={busy}
                  onClick={() => void armFailNext("versions")}
                >
                  {armedKind === "versions"
                    ? "Armed: all version saves → 500"
                    : "Arm: fail all version saves"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 justify-start text-sm"
                  disabled={busy || !failActive}
                  onClick={() => void clearFailNext()}
                >
                  Clear fail-next
                </Button>
              </div>
            </DemoSection>

            <DemoSection
              id="auth"
              title="Auth (JWT)"
              hint="Notes API requires a server-minted Bearer token. Missing/invalid tokens and bare X-Actor-Id get 401; the session JWT succeeds."
              open={openSection === "auth"}
              onToggle={toggleSection}
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 justify-start text-sm"
                disabled={busy}
                onClick={() => void showcaseJwtAuth()}
              >
                Showcase invalid vs valid token
              </Button>
            </DemoSection>

            <DemoSection
              id="realtime"
              title="Realtime"
              hint="Re-send the last logged WS event with the same eventId (at-least-once). Subscribed tabs should toast “WS duplicate dropped”. Open a note detail (Live) and save/transition first."
              open={openSection === "realtime"}
              onToggle={toggleSection}
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 justify-start text-sm"
                disabled={busy}
                onClick={() => void resendDuplicateWs()}
              >
                Resend last WS event (duplicate eventId)
              </Button>
            </DemoSection>

            <DemoSection
              id="page"
              title="This page"
              hint={
                controls.length === 0
                  ? "Open Notes for empty-workspace showcase, or a note for conflict / throw demos. Dataset is the API auto-seed (100k). DevTools → Network → Offline for queue demos."
                  : "Page-scoped demo actions for the current route."
              }
              badge={controls.length ? String(controls.length) : undefined}
              active={pageActive}
              open={openSection === "page"}
              onToggle={toggleSection}
            >
              {controls.length === 0 ? (
                <p className="text-xs text-(--muted)">No page actions.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {controls.map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={c.active ? "default" : "outline"}
                      className="h-9 justify-start text-sm"
                      onClick={c.onClick}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              )}
            </DemoSection>
          </div>

          {message ? (
            <p className="max-h-24 shrink-0 overflow-y-auto border-t border-(--border) px-3 py-2 whitespace-pre-wrap text-xs text-(--muted)">
              {message}
            </p>
          ) : null}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-stone-50 ${
          anyArmed
            ? "border-teal-500 bg-teal-50 text-teal-900"
            : "border-(--border) bg-(--card)"
        }`}
        title="Demo controls (D)"
      >
        {anyArmed ? (
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full bg-teal-600"
            aria-hidden
          />
        ) : null}
        {open ? "Hide demo" : "Demo · D"}
      </button>
    </div>
  );
}
