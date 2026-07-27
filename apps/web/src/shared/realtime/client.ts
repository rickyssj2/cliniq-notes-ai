import { config } from "@shared/config";
import type {
  ConnectionStatus,
  RealtimeInbound,
  RealtimeUser,
} from "./types";
import { isRealtimeEvent } from "./types";

type StatusListener = (status: ConnectionStatus) => void;
type MessageListener = (msg: RealtimeInbound) => void;

const MAX_BACKOFF_MS = 15_000;
const BASE_BACKOFF_MS = 500;

/**
 * Singleton WS client: viewport subscriptions, presence, reconnect + cursor replay.
 */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = "idle";
  private user: RealtimeUser | null = null;
  private lastEventId: string | null = null;
  private sources = new Map<string, Set<string>>();
  private subscribed = new Set<string>();
  private presenceNoteId: string | null = null;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = BASE_BACKOFF_MS;
  private statusListeners = new Set<StatusListener>();
  private messageListeners = new Set<MessageListener>();

  getStatus() {
    return this.status;
  }

  getLastEventId() {
    return this.lastEventId;
  }

  setUser(user: RealtimeUser | null) {
    this.user = user;
    if (this.ws?.readyState === WebSocket.OPEN && user) {
      this.flushSubscriptions(true);
      if (this.presenceNoteId) {
        this.sendPresenceJoin(this.presenceNoteId);
      }
    }
  }

  /** Register a named set of note ids (e.g. "viewport", "detail"). */
  setSource(sourceId: string, noteIds: string[]) {
    this.sources.set(sourceId, new Set(noteIds));
    this.syncSubscriptions();
  }

  clearSource(sourceId: string) {
    this.sources.delete(sourceId);
    this.syncSubscriptions();
  }

  setPresenceNote(noteId: string | null) {
    const prev = this.presenceNoteId;
    if (prev && prev !== noteId && this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: "presence.leave", noteId: prev });
    }
    this.presenceNoteId = noteId;
    if (noteId) {
      this.setSource("presence", [noteId]);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendPresenceJoin(noteId);
      }
    } else {
      this.clearSource("presence");
    }
  }

  connect() {
    this.intentionalClose = false;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.openSocket();
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.subscribed.clear();
    this.setStatus("closed");
  }

  subscribeStatus(listener: StatusListener) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  subscribeMessages(listener: MessageListener) {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private setStatus(next: ConnectionStatus) {
    this.status = next;
    for (const l of this.statusListeners) l(next);
  }

  private desiredIds(): Set<string> {
    const all = new Set<string>();
    for (const ids of this.sources.values()) {
      for (const id of ids) all.add(id);
    }
    return all;
  }

  private openSocket() {
    this.setStatus(
      this.status === "idle" || this.status === "closed"
        ? "connecting"
        : "reconnecting",
    );
    const ws = new WebSocket(config.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.backoffMs = BASE_BACKOFF_MS;
      this.setStatus("open");
      this.subscribed.clear();
      this.flushSubscriptions(true);
      if (this.presenceNoteId) {
        this.sendPresenceJoin(this.presenceNoteId);
      }
    };

    ws.onmessage = (evt) => {
      let msg: RealtimeInbound;
      try {
        msg = JSON.parse(String(evt.data)) as RealtimeInbound;
      } catch {
        return;
      }
      if (isRealtimeEvent(msg)) {
        this.lastEventId = msg.eventId;
      }
      for (const l of this.messageListeners) l(msg);
    };

    ws.onclose = () => {
      this.ws = null;
      this.subscribed.clear();
      if (this.intentionalClose) {
        this.setStatus("closed");
        return;
      }
      this.setStatus("reconnecting");
      const jitter = Math.random() * 0.4 + 0.8;
      const delay = Math.min(MAX_BACKOFF_MS, this.backoffMs) * jitter;
      this.backoffMs = Math.min(MAX_BACKOFF_MS, this.backoffMs * 2);
      this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
    };

    ws.onerror = () => {
      // onclose handles reconnect
    };
  }

  private syncSubscriptions() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.flushSubscriptions(false);
  }

  private flushSubscriptions(forceReplay: boolean) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const desired = this.desiredIds();
    const toRemove = [...this.subscribed].filter((id) => !desired.has(id));
    const toAdd = [...desired].filter((id) => !this.subscribed.has(id));

    if (toRemove.length) {
      this.send({ type: "unsubscribe", noteIds: toRemove });
      for (const id of toRemove) this.subscribed.delete(id);
    }

    if (toAdd.length || forceReplay) {
      const noteIds = forceReplay ? [...desired] : toAdd;
      for (const id of noteIds) this.subscribed.add(id);
      this.send({
        type: "subscribe",
        noteIds,
        lastEventId: this.lastEventId,
        ...(this.user ? { user: this.user } : {}),
      });
    }
  }

  private sendPresenceJoin(noteId: string) {
    if (!this.user) return;
    this.send({
      type: "presence.join",
      noteId,
      user: this.user,
    });
  }

  private send(payload: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }
}

export const realtimeClient = new RealtimeClient();
