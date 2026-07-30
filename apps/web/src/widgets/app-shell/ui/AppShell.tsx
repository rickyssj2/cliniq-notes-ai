import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { can, useRole, type Capability } from "@entities/user";
import { RoleSwitcher } from "@features/switch-role";
import { RealtimeStatusBadge } from "@features/realtime-sync";
import {
  ConnectivityBanner,
  useEffectiveOnline,
} from "@features/offline-queue";
import { OPEN_SHORTCUTS_EVENT } from "@features/keyboard-shortcuts";
import { AppErrorBoundary } from "@shared/ui/error-boundary";
import { cn } from "@shared/lib";

type NavItem = {
  to: string;
  label: string;
  capability: Capability;
};

const NAV: NavItem[] = [
  { to: "/", label: "Home", capability: "view_notes" },
  { to: "/notes", label: "Notes", capability: "view_notes" },
  { to: "/admin", label: "Admin", capability: "access_admin" },
];

function navClass(isActive: boolean, allowed: boolean) {
  const base = "rounded-md px-3 py-1.5 text-sm transition-colors";
  if (!allowed)
    return `${base} cursor-not-allowed text-(--muted)/50 line-through`;
  if (isActive)
    return `${base} bg-(--accent) text-(--accent-foreground)`;
  return `${base} text-(--foreground) hover:bg-black/5`;
}

export function AppShell() {
  const role = useRole();
  const location = useLocation();
  const online = useEffectiveOnline();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-(--border) bg-(--card)/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <p className="shrink-0 text-sm font-semibold tracking-tight">
            Soulside
          </p>

          <nav
            className="hidden min-w-0 flex-1 items-center gap-1 md:flex"
            aria-label="Primary"
          >
            {NAV.map((item) => {
              const access = can(role, item.capability);
              if (!access.ok) {
                return (
                  <span
                    key={item.to}
                    title={access.reason}
                    className={navClass(false, false)}
                    aria-disabled="true"
                  >
                    {item.label}
                  </span>
                );
              }
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) => navClass(isActive, true)}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <RealtimeStatusBadge online={online} />
            <button
              type="button"
              className="hidden items-center gap-1 rounded-md px-2 py-1 text-xs text-(--muted) hover:bg-black/5 hover:text-(--foreground) sm:inline-flex"
              title="Keyboard shortcuts (?)"
              onClick={() =>
                window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))
              }
            >
              Shortcuts
              <kbd className="rounded border border-(--border) bg-stone-50 px-1 py-0.5 font-mono text-[10px]">
                ?
              </kbd>
            </button>
            <div className="hidden sm:block">
              <RoleSwitcher />
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-(--border) text-sm md:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        <div
          id="mobile-nav"
          className={cn(
            "border-t border-(--border) bg-(--card) px-4 py-3 md:hidden",
            menuOpen ? "block" : "hidden",
          )}
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile primary">
            {NAV.map((item) => {
              const access = can(role, item.capability);
              if (!access.ok) {
                return (
                  <span
                    key={item.to}
                    title={access.reason}
                    className={navClass(false, false)}
                    aria-disabled="true"
                  >
                    {item.label}
                  </span>
                );
              }
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) => navClass(isActive, true)}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="mt-3 flex flex-col gap-3 border-t border-(--border) pt-3 sm:hidden">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-(--muted) hover:bg-black/5"
              onClick={() =>
                window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))
              }
            >
              Keyboard shortcuts
              <kbd className="rounded border border-(--border) bg-stone-50 px-1 py-0.5 font-mono text-[10px]">
                ?
              </kbd>
            </button>
            <RoleSwitcher />
          </div>
        </div>
      </header>
      <ConnectivityBanner />
      <div className="flex-1">
        <AppErrorBoundary
          label="page"
          variant="page"
          resetKeys={[location.pathname]}
        >
          <Outlet />
        </AppErrorBoundary>
      </div>
      <footer className="mt-auto border-t border-(--border) bg-(--card)/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-(--muted) sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} Soulside AI — Clinical notes take-home
            demo. Not for production use.
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <span>Privacy</span>
            <span aria-hidden="true">·</span>
            <span>Terms</span>
            <span aria-hidden="true">·</span>
            <span>Support</span>
            <span aria-hidden="true">·</span>
            <span>Status</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
