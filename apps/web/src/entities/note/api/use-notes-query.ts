import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorPage, NoteSummary } from "@soulside/domain";
import { fetchNotesPage } from "./notes-api";
import { notesQueryKeys, type NotesFilterState } from "./query-keys";
import { noteMatchesListFilters } from "../lib/note-matches-list-filters";

/** Page size for list fetches — keep in sync with scroll-window math. */
export const NOTES_PAGE_SIZE = 50;

/**
 * Sliding cache window for the infinite list. Caps client memory while still
 * allowing scroll-back via `getPreviousPageParam` + `fetchPreviousPage`.
 * 6 × 50 ≈ 300 summaries retained at once.
 */
export const NOTES_LIST_MAX_PAGES = 6;

export function useNotesInfiniteQuery(filters: NotesFilterState) {
  return useInfiniteQuery({
    queryKey: notesQueryKeys.list(filters),
    queryFn: ({ pageParam }) =>
      fetchNotesPage({
        ...filters,
        cursor: pageParam,
        limit: NOTES_PAGE_SIZE,
      }),
    initialPageParam: null as string | null,
    maxPages: NOTES_LIST_MAX_PAGES,
    getNextPageParam: (last) =>
      last.cursor.hasMore ? last.cursor.next : undefined,
    getPreviousPageParam: (first) =>
      first.cursor.hasPrev ? first.cursor.prev : undefined,
  });
}

/**
 * Patch a note across all cached list pages. If the updated note no longer
 * matches that list's filter params (e.g. READY → APPROVED while filtering
 * READY), remove it from that cache so the UI stays honest.
 */
export function usePatchNoteInLists() {
  const queryClient = useQueryClient();

  return (note: NoteSummary) => {
    const queries = queryClient.getQueriesData<{
      pages: CursorPage<NoteSummary>[];
      pageParams: unknown[];
    }>({ queryKey: notesQueryKeys.lists() });

    for (const [queryKey, old] of queries) {
      if (!old) continue;
      const params = queryKey[2] as NotesFilterState | undefined;

      queryClient.setQueryData(queryKey, {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.flatMap((item) => {
            if (item.id !== note.id) return [item];
            const next = { ...item, ...note };
            if (params && !noteMatchesListFilters(next, params)) return [];
            return [next];
          }),
        })),
      });
    }
  };
}

export function flattenNotesPages(
  pages: CursorPage<NoteSummary>[] | undefined,
): NoteSummary[] {
  if (!pages) return [];
  return pages.flatMap((p) => p.items);
}
