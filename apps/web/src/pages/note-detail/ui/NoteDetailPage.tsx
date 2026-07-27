import { Link, useParams } from "react-router";
import { useNoteDetailQuery } from "@entities/note";
import { useEffectiveOnline } from "@features/offline-queue";
import { ApiError, isNetworkError } from "@shared/api";
import { NoteWorkspace } from "@widgets/note-workspace";

export function NoteDetailPage() {
  const { noteId } = useParams();
  const online = useEffectiveOnline();
  const query = useNoteDetailQuery(noteId);

  if (!noteId) {
    return (
      <main className="px-6 py-10">
        <p>Missing note id.</p>
      </main>
    );
  }

  // Prefer cached data while offline (even if a refetch failed).
  if (query.data) {
    return <NoteWorkspace note={query.data} />;
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

  const network =
    !online || isNetworkError(query.error);
  const notFound =
    query.error instanceof ApiError && query.error.status === 404;

  if (network) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
        <h1 className="text-2xl font-semibold">You’re offline</h1>
        <p className="text-sm text-[var(--muted)]">
          This note isn’t in the local cache. Open it while online first, or go
          back to notes you’ve already loaded this session.
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

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <h1 className="text-2xl font-semibold">
        {notFound ? "Note not found" : "Couldn’t load note"}
      </h1>
      <p className="text-sm text-[var(--muted)]">
        {notFound
          ? `Could not load ${noteId}. It may have been cleared by a reseed.`
          : query.error instanceof Error
            ? query.error.message
            : "Unexpected error loading this note."}
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
