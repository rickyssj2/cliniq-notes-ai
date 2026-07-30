import { RequireCapability } from "@entities/user";

export function AdminPage() {
  return (
    <RequireCapability capability="access_admin">
      <main className="mx-auto max-w-6xl space-y-4 px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="max-w-2xl text-sm text-(--muted)">
          ADMIN only. Clinicians and reviewers hitting <code>/admin</code> get a
          permission denied message — distinct from missing data.
        </p>
        <div className="rounded-lg border border-(--border) bg-(--card) px-6 py-8 text-sm text-(--muted)">
          Use the Demo FAB (<kbd className="font-mono">D</kbd>) for fail-next /
          force-conflict on a note. Dataset is the API auto-seed (100k).
        </div>
      </main>
    </RequireCapability>
  );
}
