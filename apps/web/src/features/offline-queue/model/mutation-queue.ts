import type { NoteStatus, SoapContent } from "@soulside/domain";
import { db, type MutationQueueItem } from "@shared/db";

export type CreateVersionPayload = {
  baseVersionId: string;
  content: SoapContent;
  actorId: string;
};

export type TransitionPayload = {
  to: NoteStatus;
  actorId: string;
  reason?: string;
  mfaVerified?: boolean;
};

const listeners = new Set<() => void>();

export function subscribeQueueStats(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyQueue() {
  for (const l of listeners) l();
}

export function touchQueueStats() {
  notifyQueue();
}

export async function countPendingMutations(): Promise<number> {
  return db.mutationQueue
    .filter((i) => i.status === "pending" || i.status === "in_flight" || i.status === "failed")
    .count();
}

/** Reset interrupted drains after reload. */
export async function recoverInFlightMutations() {
  await db.mutationQueue
    .where("status")
    .equals("in_flight")
    .modify({ status: "pending" });
  notifyQueue();
}

/**
 * Enqueue a version save. Coalesces: replaces any pending create_version for
 * the same note so rapid offline edits don't stack duplicate POSTs.
 */
export async function enqueueCreateVersion(input: {
  noteId: string;
  clientMutationId: string;
  baseVersionId: string;
  content: SoapContent;
  actorId: string;
}): Promise<number> {
  const pending = await db.mutationQueue
    .where("noteId")
    .equals(input.noteId)
    .filter(
      (i) => i.type === "create_version" && i.status === "pending",
    )
    .toArray();

  for (const row of pending) {
    if (row.id != null) await db.mutationQueue.delete(row.id);
  }

  const id = await db.mutationQueue.add({
    clientMutationId: input.clientMutationId,
    noteId: input.noteId,
    type: "create_version",
    payload: {
      baseVersionId: input.baseVersionId,
      content: input.content,
      actorId: input.actorId,
    } satisfies CreateVersionPayload,
    baseVersionId: input.baseVersionId,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
  notifyQueue();
  if (id == null) throw new Error("Failed to enqueue create_version");
  return id;
}

export async function enqueueTransition(input: {
  noteId: string;
  clientMutationId: string;
  to: NoteStatus;
  actorId: string;
  reason?: string;
  mfaVerified?: boolean;
}): Promise<number> {
  const id = await db.mutationQueue.add({
    clientMutationId: input.clientMutationId,
    noteId: input.noteId,
    type: "transition",
    payload: {
      to: input.to,
      actorId: input.actorId,
      reason: input.reason,
      mfaVerified: input.mfaVerified ?? true,
    } satisfies TransitionPayload,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
  notifyQueue();
  if (id == null) throw new Error("Failed to enqueue transition");
  return id;
}

export async function listDrainable(): Promise<MutationQueueItem[]> {
  const rows = await db.mutationQueue
    .orderBy("createdAt")
    .filter((i) => i.status === "pending" || i.status === "failed")
    .toArray();
  return rows;
}

export async function markInFlight(id: number) {
  await db.mutationQueue.update(id, { status: "in_flight" });
  notifyQueue();
}

export async function markFailed(id: number, lastError: string) {
  const row = await db.mutationQueue.get(id);
  await db.mutationQueue.update(id, {
    status: "failed",
    attempts: (row?.attempts ?? 0) + 1,
    lastError,
  });
  notifyQueue();
}

export async function removeMutation(id: number) {
  await db.mutationQueue.delete(id);
  notifyQueue();
}

export async function getLatestPendingCreateVersion(
  noteId: string,
): Promise<MutationQueueItem | undefined> {
  const rows = await db.mutationQueue
    .where("noteId")
    .equals(noteId)
    .filter(
      (i) =>
        i.type === "create_version" &&
        (i.status === "pending" || i.status === "failed" || i.status === "in_flight"),
    )
    .toArray();
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return rows[rows.length - 1];
}

export async function countPendingForNote(noteId: string): Promise<number> {
  return db.mutationQueue
    .where("noteId")
    .equals(noteId)
    .filter(
      (i) =>
        i.status === "pending" || i.status === "in_flight" || i.status === "failed",
    )
    .count();
}

export async function listPendingForNote(
  noteId: string,
): Promise<MutationQueueItem[]> {
  const rows = await db.mutationQueue
    .where("noteId")
    .equals(noteId)
    .filter(
      (i) =>
        i.status === "pending" || i.status === "in_flight" || i.status === "failed",
    )
    .toArray();
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return rows;
}
