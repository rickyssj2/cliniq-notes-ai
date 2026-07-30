import type { ReactNode } from "react";
import { useRole } from "../model/session";
import {
  can,
  type Capability,
} from "../model/permissions";

type GuardProps = {
  capability: Capability;
  children: ReactNode;
  /** When true, render nothing instead of the forbidden panel. */
  silent?: boolean;
};

/** Route/page-level guard. Missing permission ≠ empty data. */
export function RequireCapability({
  capability,
  children,
  silent = false,
}: GuardProps) {
  const role = useRole();
  const access = can(role, capability);

  if (access.ok) return children;

  if (silent) return null;

  return (
    <section
      role="alert"
      className="mx-auto max-w-xl space-y-3 rounded-lg border border-(--danger)/30 bg-red-50 px-6 py-8"
    >
      <p className="text-xs font-semibold tracking-[0.16em] text-(--danger) uppercase">
        Permission denied
      </p>
      <h1 className="text-2xl font-semibold text-(--foreground)">
        You don’t have access to this area
      </h1>
      <p className="text-sm text-(--muted)">{access.reason}</p>
      <p className="text-sm text-(--muted)">
        This is not an empty dataset — the route is gated by your role (
        <code>{role}</code>). Switch role in the header to continue.
      </p>
    </section>
  );
}
