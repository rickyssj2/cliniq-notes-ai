import { realtimeClient } from "./client";

/**
 * Notes kicked into GENERATING drop out of the viewport subscription (and
 * filtered lists). Keep them subscribed until generation finishes so we
 * receive READY_FOR_REVIEW / FAILED over WS and can refresh list caches.
 */
const pending = new Set<string>();

function syncSource() {
  realtimeClient.setSource("pending-generation", [...pending]);
}

export function trackPendingGeneration(noteIds: string | string[]) {
  const ids = Array.isArray(noteIds) ? noteIds : [noteIds];
  let changed = false;
  for (const id of ids) {
    if (!pending.has(id)) {
      pending.add(id);
      changed = true;
    }
  }
  if (changed) syncSource();
}

export function clearPendingGeneration(noteId: string) {
  if (!pending.delete(noteId)) return;
  syncSource();
}

export function clearAllPendingGeneration() {
  if (pending.size === 0) return;
  pending.clear();
  realtimeClient.clearSource("pending-generation");
}
