import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorPage, NoteSummary } from "@soulside/domain";
import { fetchNotesPage } from "./notes-api";
import { notesQueryKeys, type NotesFilterState } from "./query-keys";
import { noteMatchesListFilters } from "../lib/note-matches-list-filters";

export function useNotesInfiniteQuery(filters: NotesFilterState) {
  return useInfiniteQuery({
    queryKey: notesQueryKeys.list(filters),
    queryFn: ({ pageParam }) =>
      fetchNotesPage({
        ...filters,
        cursor: pageParam,
        limit: 50,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.cursor.hasMore ? last.cursor.next : undefined,
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
