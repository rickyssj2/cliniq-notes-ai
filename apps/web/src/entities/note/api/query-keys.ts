import type { NoteStatus } from "@soulside/domain";

export type NotesSortField = "updatedAt" | "createdAt" | "status";
export type NotesSortOrder = "asc" | "desc";

export type NotesListParams = {
  statuses: NoteStatus[];
  reviewerId: string;
  patientId: string;
  q: string;
  sort: NotesSortField;
  order: NotesSortOrder;
  updatedFrom: string;
  updatedTo: string;
  limit?: number;
  cursor?: string | null;
};

/** Filter fields that form the list query key (no cursor/limit). */
export type NotesFilterState = Omit<NotesListParams, "cursor" | "limit">;

export const notesQueryKeys = {
  all: ["notes"] as const,
  lists: () => [...notesQueryKeys.all, "list"] as const,
  list: (params: NotesFilterState) =>
    [...notesQueryKeys.lists(), params] as const,
  detail: (id: string) => [...notesQueryKeys.all, "detail", id] as const,
  version: (noteId: string, versionId: string) =>
    [...notesQueryKeys.all, "version", noteId, versionId] as const,
  devUsers: () => [...notesQueryKeys.all, "dev-users"] as const,
};
