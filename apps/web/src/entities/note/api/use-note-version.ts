import { useQuery } from "@tanstack/react-query";
import { fetchNoteVersion } from "./notes-api";
import { notesQueryKeys } from "./query-keys";

export function useNoteVersionQuery(
  noteId: string | undefined,
  versionId: string | null | undefined,
) {
  return useQuery({
    queryKey: notesQueryKeys.version(noteId ?? "", versionId ?? ""),
    queryFn: () => fetchNoteVersion(noteId!, versionId!),
    enabled: Boolean(noteId && versionId),
    staleTime: 60_000,
  });
}
