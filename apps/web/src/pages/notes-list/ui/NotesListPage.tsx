import { Link } from "react-router";
import { GuardedButton, useActor } from "@entities/user";

/** Phase 3 placeholder — real virtualized list arrives in Phase 4. */
export function NotesListPage() {
  const actor = useActor();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <div className="space-y-2">
        <p className="text-sm font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
          Phase 3 · Notes
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Placeholder list surface. All roles can view this route. Workflow
          mutations are gated separately — try bulk assign as an auditor vs a
          reviewer.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-10 text-center">
        <p className="text-sm font-medium text-[var(--foreground)]">
          No notes loaded in the UI yet
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This is an <strong>empty data</strong> state (Phase 4 will populate
          it) — not a permission error. Signed in as {actor.displayName}.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/lab"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-medium"
          >
            Seed data in API Lab
          </Link>
          <GuardedButton type="button" capability="bulk_assign">
            Bulk assign reviewer
          </GuardedButton>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Hover the bulk button when disabled to read the denial reason.
        </p>
      </div>
    </main>
  );
}
