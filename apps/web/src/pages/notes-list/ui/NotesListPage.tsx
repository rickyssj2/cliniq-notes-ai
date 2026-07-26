import { useMemo } from "react";
import {
  flattenNotesPages,
  useNotesInfiniteQuery,
} from "@entities/note";
import { NotesFilters, useNotesListSearchParams } from "@features/filter-notes";
import { BulkActionsBar } from "@features/bulk-note-actions";
import { NotesTable } from "@widgets/notes-table";

export function NotesListPage() {
  const { filters, patch, hasActiveFilters, toggleSort } =
    useNotesListSearchParams();
  const query = useNotesInfiniteQuery(filters);

  const notes = useMemo(
    () => flattenNotesPages(query.data?.pages),
    [query.data?.pages],
  );

  const notesById = useMemo(() => {
    const map = new Map(notes.map((n) => [n.id, n]));
    return map;
  }, [notes]);

  const total = query.data?.pages[0]?.meta.total ?? 0;

  let emptyMode: "loading" | "empty" | "no-results" | "ready" = "ready";
  if (query.isLoading) emptyMode = "loading";
  else if (notes.length === 0 && hasActiveFilters) emptyMode = "no-results";
  else if (notes.length === 0) emptyMode = "empty";

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8 pb-28">
      <div className="space-y-2">
        <p className="text-sm font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
          Phase 4 · Notes
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Cursor-paginated, virtualized list. Filters and sort live in the URL —
          copy the address bar to deep-link. Selection survives scroll/pagination.
        </p>
      </div>

      <NotesFilters
        filters={filters}
        onChange={patch}
        onClear={() =>
          patch({
            statuses: [],
            reviewerId: "",
            patientId: "",
            q: "",
            updatedFrom: "",
            updatedTo: "",
          })
        }
      />

      <NotesTable
        notes={notes}
        total={total}
        isLoading={query.isLoading}
        isFetchingNextPage={query.isFetchingNextPage}
        hasNextPage={Boolean(query.hasNextPage)}
        fetchNextPage={() => {
          void query.fetchNextPage();
        }}
        sort={filters.sort}
        order={filters.order}
        onToggleSort={toggleSort}
        emptyMode={emptyMode}
      />

      <BulkActionsBar notesById={notesById} />
    </main>
  );
}
