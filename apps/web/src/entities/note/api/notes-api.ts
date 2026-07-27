import type {
  CursorPage,
  NoteDetail,
  NoteSummary,
  NoteStatus,
  NoteVersion,
  SoapContent,
} from "@soulside/domain";
import { apiFetch } from "@shared/api";
import type { NotesListParams } from "./query-keys";

function buildListSearch(params: NotesListParams): string {
  const sp = new URLSearchParams();
  sp.set("limit", String(params.limit ?? 50));
  if (params.cursor) sp.set("cursor", params.cursor);
  if (params.statuses.length) sp.set("status", params.statuses.join(","));
  if (params.reviewerId) sp.set("reviewerId", params.reviewerId);
  if (params.patientId) sp.set("patientId", params.patientId);
  if (params.q) sp.set("q", params.q);
  if (params.sort) sp.set("sort", params.sort);
  if (params.order) sp.set("order", params.order);
  if (params.updatedFrom) sp.set("updatedFrom", params.updatedFrom);
  if (params.updatedTo) sp.set("updatedTo", params.updatedTo);
  return sp.toString();
}

export async function fetchNotesPage(
  params: NotesListParams,
): Promise<CursorPage<NoteSummary>> {
  const { data } = await apiFetch<CursorPage<NoteSummary>>(
    `/notes?${buildListSearch(params)}`,
  );
  return data;
}

export async function fetchNoteDetail(id: string): Promise<NoteDetail> {
  const { data } = await apiFetch<NoteDetail>(`/notes/${id}`);
  return data;
}

export async function fetchNoteVersion(
  noteId: string,
  versionId: string,
): Promise<NoteVersion> {
  const { data } = await apiFetch<NoteVersion>(
    `/notes/${noteId}/versions/${versionId}`,
  );
  return data;
}

export async function saveNoteVersion(input: {
  noteId: string;
  baseVersionId: string;
  content: SoapContent;
  clientMutationId: string;
  actorId?: string;
  headers?: Record<string, string>;
}) {
  const { data } = await apiFetch<{
    version: { id: string; revision: number; parentVersionId: string };
  }>(`/notes/${input.noteId}/versions`, {
    method: "POST",
    headers: input.headers,
    body: JSON.stringify({
      baseVersionId: input.baseVersionId,
      content: input.content,
      clientMutationId: input.clientMutationId,
      ...(input.actorId ? { actorId: input.actorId } : {}),
    }),
  });
  return data;
}

export async function setDevFailNext(patch: {
  versions?: number;
  transitions?: number;
  noteGets?: number;
  conflicts?: number;
}) {
  const { data } = await apiFetch<{
    failNext: {
      versions: number;
      transitions: number;
      noteGets: number;
      conflicts: number;
    };
  }>("/dev/chaos", {
    method: "POST",
    body: JSON.stringify({ failNext: patch }),
  });
  return data.failNext;
}

export async function transitionNote(input: {
  noteId: string;
  to: NoteStatus;
  actorId: string;
  reason?: string;
  mfaVerified?: boolean;
  clientMutationId: string;
}) {
  const { data } = await apiFetch<{ note: NoteSummary }>(
    `/notes/${input.noteId}/transitions`,
    {
      method: "POST",
      body: JSON.stringify({
        to: input.to,
        actorId: input.actorId,
        reason: input.reason,
        mfaVerified: input.mfaVerified ?? true,
        clientMutationId: input.clientMutationId,
      }),
    },
  );
  return data;
}

export type DevUser = {
  id: string;
  displayName: string;
  role: string;
};

export async function fetchDevUsers(): Promise<DevUser[]> {
  const { data } = await apiFetch<{ items: DevUser[] }>("/dev/users");
  return data.items;
}
