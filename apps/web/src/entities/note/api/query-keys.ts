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

export const notesQueryKeys = {
  all: ["notes"] as const,
  lists: () => [...notesQueryKeys.all, "list"] as const,
  list: (params: Omit<NotesListParams, "cursor" | "limit">) =>
    [...notesQueryKeys.lists(), params] as const,
  detail: (id: string) => [...notesQueryKeys.all, "detail", id] as const,
};
