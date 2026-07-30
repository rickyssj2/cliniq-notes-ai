import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActor } from "@entities/user";
import { applyRealtimeEvent, usePresenceStore } from "@entities/note";
import {
  isRealtimeEvent,
  realtimeClient,
  type ConnectionStatus,
} from "@shared/realtime";
import { useSyncExternalStore } from "react";

/** Boot the app-wide WS client; reconcile events into Query + stores. */
export function useRealtimeBootstrap() {
  const actor = useActor();
  const queryClient = useQueryClient();

  useEffect(() => {
    usePresenceStore.getState().clearAll();
    realtimeClient.setUser({
      id: actor.id,
      displayName: actor.displayName,
      role: actor.role,
    });
  }, [actor.displayName, actor.id, actor.role]);

  useEffect(() => {
    // Connect only when the browser is online; offline-queue owns disconnect/reconnect.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      realtimeClient.disconnect();
    } else {
      realtimeClient.connect();
    }
    const unsub = realtimeClient.subscribeMessages((msg) => {
      if (!isRealtimeEvent(msg)) return;
      applyRealtimeEvent(queryClient, msg);
    });
    return () => {
      unsub();
      // Keep socket alive across route changes; only disconnect on full unmount.
      realtimeClient.disconnect();
    };
  }, [queryClient]);
}

export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(
    (cb) => realtimeClient.subscribeStatus(cb),
    () => realtimeClient.getStatus(),
    () => realtimeClient.getStatus(),
  );
}

/** Subscribe virtualizer / detail note ids under a named source. */
export function useRealtimeNoteSource(sourceId: string, noteIds: string[]) {
  const key = noteIds.slice().sort().join(",");
  useEffect(() => {
    realtimeClient.setSource(sourceId, noteIds);
    return () => realtimeClient.clearSource(sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key encodes noteIds
  }, [sourceId, key]);
}

/** Join presence for the open note detail. */
export function useNotePresenceChannel(noteId: string | undefined) {
  const actor = useActor();

  useEffect(() => {
    if (!noteId) return;
    realtimeClient.setPresenceNote(noteId);
    return () => realtimeClient.setPresenceNote(null);
  }, [noteId]);

  // Re-join when actor changes while the same note stays open.
  useEffect(() => {
    if (!noteId) return;
    realtimeClient.rejoinPresence();
  }, [noteId, actor.id]);
}
