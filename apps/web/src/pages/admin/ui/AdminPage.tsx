import { RequireCapability } from "@entities/user";

export function AdminPage() {
  return (
    <RequireCapability capability="access_admin">
      <main className="mx-auto max-w-6xl space-y-4 px-6 py-10">
        <p className="text-sm font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
          Phase 3 · Admin
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          ADMIN only. Clinicians and reviewers hitting <code>/admin</code> get a
          permission denied message — distinct from missing data.
        </p>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-6 py-8 text-sm text-[var(--muted)]">
          Chaos toggles and seed controls stay in API Lab for now.
        </div>
      </main>
    </RequireCapability>
  );
}
