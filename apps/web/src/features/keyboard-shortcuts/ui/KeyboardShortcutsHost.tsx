import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useConflictStore } from "@entities/note";
import { TOGGLE_DEMO_EVENT } from "@features/demo-controls";
import { Button } from "@shared/ui/button";

export const OPEN_SHORTCUTS_EVENT = "soulside:open-shortcuts";

type ShortcutRow = {
  keys: string;
  action: string;
  when?: string;
};

const SHORTCUTS: ShortcutRow[] = [
  { keys: "?", action: "Show this shortcuts help" },
  { keys: "D", action: "Toggle demo controls FAB", when: "Dev" },
  { keys: "/", action: "Focus notes search", when: "Notes list" },
  { keys: "g then n", action: "Go to Notes" },
  { keys: "g then h", action: "Go to Home" },
  { keys: "g then l", action: "Go to API Lab" },
  { keys: "R", action: "Start review", when: "Note detail" },
  { keys: "A", action: "Approve", when: "Note detail" },
  { keys: "⌘/Ctrl+S", action: "Save draft now", when: "Note detail" },
  { keys: "Esc", action: "Close dialog / help" },
  { keys: "j / k", action: "Move focus down / up rows", when: "Notes list" },
  { keys: "Enter", action: "Open focused note", when: "Notes list" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("[contenteditable=true]"));
}

function clickShortcutAction(key: string) {
  const btn = document.querySelector<HTMLButtonElement>(
    `[data-shortcut-action="${key}"]`,
  );
  if (btn && !btn.disabled) {
    btn.click();
    return true;
  }
  return false;
}

/**
 * App-wide keyboard shortcuts for list navigation, routing, and CTAs.
 * Help dialog is opened with `?` or the header Shortcuts control.
 */
export function KeyboardShortcutsHost() {
  const navigate = useNavigate();
  const closeConflict = useConflictStore((s) => s.closeConflict);
  const conflictOpen = useConflictStore((s) => Boolean(s.open));
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  useEffect(() => {
    const open = () => setHelpOpen(true);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, open);
    return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, open);
  }, []);

  useEffect(() => {
    if (!pendingG) return;
    const t = window.setTimeout(() => setPendingG(false), 1200);
    return () => window.clearTimeout(t);
  }, [pendingG]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      if (e.key === "Escape") {
        if (helpOpen) {
          e.preventDefault();
          setHelpOpen(false);
          return;
        }
        if (conflictOpen) {
          e.preventDefault();
          closeConflict();
          return;
        }
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        const saveBtn = document.querySelector<HTMLButtonElement>(
          "[data-shortcut-save]",
        );
        if (saveBtn && !saveBtn.disabled) {
          e.preventDefault();
          saveBtn.click();
        }
        return;
      }

      if (isTypingTarget(e.target) && e.key !== "Escape") return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;

      if (pendingG) {
        setPendingG(false);
        const k = e.key.toLowerCase();
        if (k === "n") {
          e.preventDefault();
          navigate("/notes");
        } else if (k === "h") {
          e.preventDefault();
          navigate("/");
        } else if (k === "l") {
          e.preventDefault();
          navigate("/lab");
        }
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        window.dispatchEvent(new Event(TOGGLE_DEMO_EVENT));
        return;
      }

      if (e.key.toLowerCase() === "r") {
        if (clickShortcutAction("R")) e.preventDefault();
        return;
      }

      if (e.key.toLowerCase() === "a") {
        if (clickShortcutAction("A")) e.preventDefault();
        return;
      }

      if (e.key === "/") {
        const search = document.getElementById(
          "notes-search",
        ) as HTMLInputElement | null;
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }

      if (e.key.toLowerCase() === "g") {
        e.preventDefault();
        setPendingG(true);
        return;
      }

      if (e.key === "j" || e.key === "k" || e.key === "Enter") {
        const rows = [
          ...document.querySelectorAll<HTMLElement>("[data-note-row]"),
        ];
        if (rows.length === 0) return;
        const active = document.activeElement as HTMLElement | null;
        const idx = rows.findIndex(
          (r) => r === active || (active != null && r.contains(active)),
        );
        if (e.key === "Enter") {
          const row = idx >= 0 ? rows[idx]! : rows[0]!;
          const link = row.querySelector<HTMLAnchorElement>("a[href]");
          if (link) {
            e.preventDefault();
            link.click();
          }
          return;
        }
        e.preventDefault();
        const nextIdx =
          e.key === "j"
            ? Math.min(rows.length - 1, Math.max(0, idx) + (idx < 0 ? 0 : 1))
            : Math.max(0, (idx < 0 ? 0 : idx) - 1);
        const next = rows[nextIdx];
        next?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, helpOpen, conflictOpen, closeConflict, pendingG]);

  if (!helpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={() => setHelpOpen(false)}
    >
      <div
        className="max-h-[min(80vh,32rem)] w-full max-w-md overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="shortcuts-title" className="text-sm font-semibold">
            Keyboard shortcuts
          </h2>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setHelpOpen(false)}
          >
            Close
          </Button>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-[var(--muted)] uppercase">
              <th className="pb-2 font-medium">Keys</th>
              <th className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((row) => (
              <tr key={row.keys} className="border-t border-[var(--border)]/70">
                <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                  {row.keys}
                </td>
                <td className="py-2 text-[var(--foreground)]">
                  {row.action}
                  {row.when ? (
                    <span className="text-[var(--muted)]"> · {row.when}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Press <kbd className="font-mono">?</kbd> or use header{" "}
          <strong>Shortcuts</strong>. CTAs show their key on the button.
        </p>
      </div>
    </div>
  );
}
