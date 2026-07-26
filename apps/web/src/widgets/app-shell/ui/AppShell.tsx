import { NavLink, Outlet } from "react-router";
import { can, SessionBadge, useRole, type Capability } from "@entities/user";
import { RoleSwitcher } from "@features/switch-role";

type NavItem = {
  to: string;
  label: string;
  capability: Capability;
};

const NAV: NavItem[] = [
  { to: "/", label: "Home", capability: "view_notes" },
  { to: "/notes", label: "Notes", capability: "view_notes" },
  { to: "/review-queue", label: "Review queue", capability: "access_review_queue" },
  { to: "/admin", label: "Admin", capability: "access_admin" },
  { to: "/lab", label: "API Lab", capability: "access_api_lab" },
];

function navClass(isActive: boolean, allowed: boolean) {
  const base = "rounded-md px-3 py-1.5 text-sm transition-colors";
  if (!allowed) return `${base} cursor-not-allowed text-[var(--muted)]/50 line-through`;
  if (isActive) return `${base} bg-[var(--accent)] text-[var(--accent-foreground)]`;
  return `${base} text-[var(--foreground)] hover:bg-black/5`;
}

export function AppShell() {
  const role = useRole();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm font-semibold tracking-tight">Soulside</p>
            <nav className="flex flex-wrap gap-1" aria-label="Primary">
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
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <RoleSwitcher />
            <SessionBadge />
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
