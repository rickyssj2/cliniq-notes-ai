import { Link, useParams } from "react-router";

/** Stub until Phase 5 — keeps list row links navigable. */
export function NoteDetailPage() {
  const { noteId } = useParams();

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <p className="text-sm font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
        Phase 5 preview
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Note detail</h1>
      <p className="text-sm text-[var(--muted)]">
        Detail / SOAP editor ships in Phase 5. Opened{" "}
        <code>{noteId}</code>.
      </p>
      <Link
        to="/notes"
        className="inline-flex text-sm text-[var(--accent)] underline-offset-4 hover:underline"
      >
        ← Back to notes
      </Link>
    </main>
  );
}
