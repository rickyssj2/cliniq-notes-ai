import { useMemo } from "react";
import {
  flattenNotesPages,
  useNotesInfiniteQuery,
} from "@entities/note";
import { NotesFilters, useNotesListSearchParams } from "@features/filter-notes";
import { BulkActionsBar } from "@features/bulk-note-actions";
import { useEffectiveOnline } from "@features/offline-queue";
import { isNetworkError } from "@shared/api";
import { NotesTable } from "@widgets/notes-table";

export function NotesListPage() {
  const { filters, patch, hasActiveFilters, toggleSort } =
    useNotesListSearchParams();
  const online = useEffectiveOnline();
  const query = useNotesInfiniteQuery(filters);

  const notes = useMemo(
    () => flattenNotesPages(query.data?.pages),
    [query.data?.pages],
  );

  const notesById = useMemo(() => {
    const map = new Map(notes.map((n) => [n.id, n]));
    return map;
  }, [notes]);

  const total = query.data?.pages[0]?.meta.total ?? notes.length;

  const offlineEmpty =
    notes.length === 0 &&
    (!online || isNetworkError(query.error) || (query.isError && !online));

  let emptyMode: "loading" | "empty" | "no-results" | "offline" | "ready" =
    "ready";
  if (query.isLoading && notes.length === 0 && online) emptyMode = "loading";
  else if (offlineEmpty) emptyMode = "offline";
  else if (notes.length === 0 && hasActiveFilters) emptyMode = "no-results";
  else if (notes.length === 0) emptyMode = "empty";

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8 pb-28">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Virtualized list with viewport WebSocket subscriptions. Cached pages
          stay readable offline; edits queue to IndexedDB until you’re back.
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
        isLoading={query.isLoading && notes.length === 0}
        isFetchingNextPage={query.isFetchingNextPage}
        hasNextPage={Boolean(query.hasNextPage) && online}
        fetchNextPage={() => {
          if (!online) return;
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
