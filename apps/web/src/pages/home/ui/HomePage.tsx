import { Link } from "react-router";
import { useActor } from "@entities/user";

export function HomePage() {
  const actor = useActor();

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium tracking-[0.18em] text-[var(--muted)] uppercase">
        Soulside AI
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)]">
        Clinical notes
      </h1>
      <p className="max-w-2xl text-base text-[var(--muted)]">
        Signed in as <strong>{actor.displayName}</strong> ({actor.role}). Use the
        header switcher to change roles and watch nav + route guards update.
      </p>
      <ul className="space-y-2 text-sm text-[var(--muted)]">
        <li>
          <Link className="text-[var(--accent)] underline-offset-4 hover:underline" to="/notes">
            Notes
          </Link>{" "}
          — all roles (empty data placeholder)
        </li>
        <li>
          <Link className="text-[var(--accent)] underline-offset-4 hover:underline" to="/review-queue">
            Review queue
          </Link>{" "}
          — REVIEWER / ADMIN
        </li>
        <li>
          <Link className="text-[var(--accent)] underline-offset-4 hover:underline" to="/admin">
            Admin
          </Link>{" "}
          — ADMIN only
        </li>
        <li>
          <Link className="text-[var(--accent)] underline-offset-4 hover:underline" to="/lab">
            API Lab
          </Link>{" "}
          — not available to READONLY_AUDITOR
        </li>
      </ul>
    </main>
  );
}
