import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorPage, NoteSummary } from "@soulside/domain";
import { fetchNotesPage } from "./notes-api";
import { notesQueryKeys, type NotesListParams } from "./query-keys";

export type NotesFilterState = Omit<NotesListParams, "cursor" | "limit">;

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

export function usePatchNoteInLists() {
  const queryClient = useQueryClient();

  return (note: NoteSummary) => {
    queryClient.setQueriesData<
      { pages: CursorPage<NoteSummary>[]; pageParams: unknown[] } | undefined
    >({ queryKey: notesQueryKeys.lists() }, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.id === note.id ? { ...item, ...note } : item,
          ),
        })),
      };
    });
  };
}

export function flattenNotesPages(
  pages: CursorPage<NoteSummary>[] | undefined,
): NoteSummary[] {
  if (!pages) return [];
  return pages.flatMap((p) => p.items);
}
