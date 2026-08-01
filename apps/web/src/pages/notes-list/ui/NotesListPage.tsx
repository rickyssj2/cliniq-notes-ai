import { useEffect, useMemo, useState } from "react";
import {
  flattenNotesPages,
  useNotesInfiniteQuery,
} from "@entities/note";
import { NotesFilters, useNotesListSearchParams } from "@features/filter-notes";
import { BulkActionsBar } from "@features/bulk-note-actions";
import { useDemoControlsStore } from "@features/demo-controls";
import { useEffectiveOnline } from "@features/offline-queue";
import { isNetworkError } from "@shared/api";
import { NotesTable } from "@widgets/notes-table";

export function NotesListPage() {
  const { filters, patch, hasActiveFilters, toggleSort } =
    useNotesListSearchParams();
  const online = useEffectiveOnline();
  const query = useNotesInfiniteQuery(filters);
  const registerDemo = useDemoControlsStore((s) => s.register);
  const clearDemo = useDemoControlsStore((s) => s.clear);
  /** Dev-only: force empty-workspace UI even with a seeded dataset. */
  const [showcaseEmpty, setShowcaseEmpty] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    registerDemo(
      [
        {
          id: "showcase-empty",
          label: showcaseEmpty
            ? "Showing: empty workspace"
            : "Showcase empty workspace",
          active: showcaseEmpty,
          onClick: () => setShowcaseEmpty((v) => !v),
        },
      ],
      showcaseEmpty
        ? "Empty ≠ no-results: this forces the unfiltered empty-workspace UI without clearing the seed."
        : "Search with no matches shows no-results; use Showcase for the empty workspace.",
    );
    return () => clearDemo();
  }, [registerDemo, clearDemo, showcaseEmpty]);

  const notes = useMemo(
    () => flattenNotesPages(query.data?.pages),
    [query.data?.pages],
  );

  const notesById = useMemo(() => {
    const map = new Map(notes.map((n) => [n.id, n]));
    return map;
  }, [notes]);

  // Any retained page carries the same filtered total (pages[0] may slide away).
  const total =
    query.data?.pages.find((p) => typeof p.meta.total === "number")?.meta
      .total ?? notes.length;

  const windowStart =
    query.data?.pages[0]?.meta.offset ?? 0;
  const loadedThrough = windowStart + notes.length;

  const offlineEmpty =
    notes.length === 0 &&
    (!online || isNetworkError(query.error) || (query.isError && !online));

  let emptyMode: "loading" | "empty" | "no-results" | "offline" | "ready" =
    "ready";
  if (showcaseEmpty) emptyMode = "empty";
  else if (query.isLoading && notes.length === 0 && online) emptyMode = "loading";
  else if (offlineEmpty) emptyMode = "offline";
  else if (notes.length === 0 && hasActiveFilters) emptyMode = "no-results";
  else if (notes.length === 0) emptyMode = "empty";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8 pb-28">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
        <p className="max-w-2xl text-sm text-(--muted)">
          Virtualized list with a sliding page window and viewport WebSocket
          subscriptions. The window stays readable offline; edits queue to
          IndexedDB until you’re back.
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
        loadedThrough={loadedThrough}
        total={total}
        isLoading={query.isLoading && notes.length === 0}
        isFetchingNextPage={query.isFetchingNextPage}
        isFetchingPreviousPage={query.isFetchingPreviousPage}
        hasNextPage={Boolean(query.hasNextPage) && online}
        hasPreviousPage={Boolean(query.hasPreviousPage) && online}
        fetchNextPage={() => {
          if (!online) return;
          void query.fetchNextPage();
        }}
        fetchPreviousPage={() => {
          if (!online) return;
          void query.fetchPreviousPage();
        }}
        sort={filters.sort}
        order={filters.order}
        onToggleSort={toggleSort}
        emptyMode={emptyMode}
      />

      <BulkActionsBar notesById={notesById} />
    </div>
  );
}
