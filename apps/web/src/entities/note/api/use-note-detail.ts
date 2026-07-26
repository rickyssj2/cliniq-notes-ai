import { useQuery } from "@tanstack/react-query";
import { fetchNoteDetail } from "./notes-api";
import { notesQueryKeys } from "./query-keys";

export function useNoteDetailQuery(noteId: string | undefined) {
  return useQuery({
    queryKey: notesQueryKeys.detail(noteId ?? ""),
    queryFn: () => fetchNoteDetail(noteId!),
    enabled: Boolean(noteId),
  });
}
