import { RequireCapability } from "@entities/user";

export function ReviewQueuePage() {
  return (
    <RequireCapability capability="access_review_queue">
      <main className="mx-auto max-w-6xl space-y-4 px-6 py-10">
        <p className="text-sm font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
          Phase 3 · Review queue
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Review queue</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          REVIEWER and ADMIN only. Switch to Auditor Lee and reopen this URL —
          you should see a permission denied panel, not an empty queue.
        </p>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-6 py-8 text-sm text-[var(--muted)]">
          Queue UI lands with the notes list (Phase 4). Access check already
          works.
        </div>
      </main>
    </RequireCapability>
  );
}
