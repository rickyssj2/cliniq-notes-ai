import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { Role } from "@soulside/domain";
import { store } from "../store/store";
import type { RealtimeEvent } from "../store/types";

type ClientState = {
  id: string;
  socket: WebSocket;
  noteIds: Set<string>;
  lastEventId: string | null;
  user: { id: string; displayName: string; role: Role } | null;
};

type ClientMessage =
  | {
      type: "subscribe";
      noteIds?: string[];
      lastEventId?: string | null;
      user?: { id: string; displayName: string; role: Role };
    }
  | { type: "unsubscribe"; noteIds?: string[] }
  | {
      type: "presence.join";
      noteId: string;
      user: { id: string; displayName: string; role: Role };
    }
  | { type: "presence.leave"; noteId: string }
  | { type: "replay"; since?: string | null };

let nextClientId = 1;

/** Live sockets — set by `attachRealtime` for demo rebroadcast. */
let liveClients: Map<string, ClientState> | null = null;

/**
 * Fan-out an existing realtime payload without minting a new `eventId`
 * (demo: at-least-once duplicate delivery). Marks `demoDuplicate` so every
 * subscribed client can toast the drop — not only the tab that POSTed.
 */
export function rebroadcastRealtimeEvent(event: RealtimeEvent): number {
  if (!liveClients) return 0;
  const payload = JSON.stringify({ ...event, demoDuplicate: true as const });
  let recipients = 0;
  for (const client of liveClients.values()) {
    if (client.socket.readyState !== client.socket.OPEN) continue;
    if (!client.noteIds.has(event.noteId)) continue;
    client.socket.send(payload);
    recipients += 1;
  }
  return recipients;
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Map<string, ClientState>();
  liveClients = clients;

  const unsubscribeStore = store.subscribe((event) => {
    for (const client of clients.values()) {
      if (client.socket.readyState !== client.socket.OPEN) continue;
      if (!client.noteIds.has(event.noteId)) continue;
      client.socket.send(JSON.stringify(event));
      client.lastEventId = event.eventId;
    }
  });

  wss.on("connection", (socket) => {
    const id = `sock_${nextClientId++}`;
    const client: ClientState = {
      id,
      socket,
      noteIds: new Set(),
      lastEventId: null,
      user: null,
    };
    clients.set(id, client);

    socket.send(
      JSON.stringify({
        type: "connected",
        socketId: id,
        at: new Date().toISOString(),
      }),
    );

    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        socket.send(JSON.stringify({ type: "error", error: "invalid_json" }));
        return;
      }

      switch (msg.type) {
        case "subscribe": {
          if (msg.user) client.user = msg.user;
          const added: string[] = [];
          for (const noteId of msg.noteIds ?? []) {
            if (!client.noteIds.has(noteId)) added.push(noteId);
            client.noteIds.add(noteId);
          }
          const since = msg.lastEventId ?? client.lastEventId;
          const missed = store.eventsSince(since).filter((e) =>
            client.noteIds.has(e.noteId),
          );
          for (const event of missed) {
            socket.send(JSON.stringify(event));
            client.lastEventId = event.eventId;
          }
          // Current presence for newly subscribed notes (not in the event log).
          for (const noteId of added) {
            const viewers = store.listPresence(noteId);
            if (viewers.length === 0) continue;
            socket.send(
              JSON.stringify({
                type: "note.presence",
                eventId: `snap_${client.id}_${noteId}`,
                noteId,
                viewers,
                at: new Date().toISOString(),
              }),
            );
          }
          socket.send(
            JSON.stringify({
              type: "subscribed",
              noteIds: [...client.noteIds],
              replayed: missed.length,
            }),
          );
          break;
        }
        case "unsubscribe": {
          // Data-channel only. Do not clear presence here — viewport scroll
          // unsubscribes dozens of rows and would spam empty note.presence.
          // Presence is cleared via presence.leave or socket close.
          for (const noteId of msg.noteIds ?? []) {
            client.noteIds.delete(noteId);
          }
          break;
        }
        case "presence.join": {
          client.noteIds.add(msg.noteId);
          store.setPresence(msg.noteId, id, {
            userId: msg.user.id,
            displayName: msg.user.displayName,
            role: msg.user.role,
          });
          break;
        }
        case "presence.leave": {
          store.setPresence(msg.noteId, id, null);
          break;
        }
        case "replay": {
          const missed = store.eventsSince(msg.since).filter((e) =>
            client.noteIds.has(e.noteId),
          );
          for (const event of missed) {
            socket.send(JSON.stringify(event));
            client.lastEventId = event.eventId;
          }
          socket.send(
            JSON.stringify({ type: "replayed", count: missed.length }),
          );
          break;
        }
        default:
          socket.send(JSON.stringify({ type: "error", error: "unknown_type" }));
      }
    });

    socket.on("close", () => {
      store.clearSocketPresence(id);
      clients.delete(id);
    });
  });

  return {
    wss,
    close: () => {
      unsubscribeStore();
      liveClients = null;
      wss.close();
    },
  };
}
