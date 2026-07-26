import { Link, useParams } from "react-router";
import { useNoteDetailQuery } from "@entities/note";
import { NoteWorkspace } from "@widgets/note-workspace";

export function NoteDetailPage() {
  const { noteId } = useParams();
  const query = useNoteDetailQuery(noteId);

  if (!noteId) {
    return (
      <main className="px-6 py-10">
        <p>Missing note id.</p>
      </main>
    );
  }

  if (query.isLoading) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 px-6 py-10">
        <div className="h-8 w-48 animate-pulse rounded bg-stone-200" />
        <div className="h-40 animate-pulse rounded bg-stone-200" />
        <div className="h-64 animate-pulse rounded bg-stone-200" />
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
        <h1 className="text-2xl font-semibold">Note not found</h1>
        <p className="text-sm text-[var(--muted)]">
          Could not load <code>{noteId}</code>. It may have been cleared by a
          reseed.
        </p>
        <Link
          to="/notes"
          className="text-sm text-[var(--accent)] underline-offset-4 hover:underline"
        >
          ← Back to notes
        </Link>
      </main>
    );
  }

  return <NoteWorkspace note={query.data} />;
}
