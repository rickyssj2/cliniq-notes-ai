import type { NoteStatus, Role, SoapContent, UserRef } from "@soulside/domain";

export type RealtimeEvent =
  | {
      type: "note.status_changed";
      eventId: string;
      noteId: string;
      fromStatus: NoteStatus;
      toStatus: NoteStatus;
      actor: UserRef;
      at: string;
      /** Echo of client X-Correlation-Id when the mutation carried one. */
      correlationId?: string;
      /** Set only on DEV demo rebroadcasts (same eventId, all subscribers). */
      demoDuplicate?: true;
    }
  | {
      type: "note.version_added";
      eventId: string;
      noteId: string;
      version: {
        id: string;
        revision: number;
        parentVersionId: string | null;
        content: SoapContent;
        authoredBy: UserRef;
      };
      at: string;
      correlationId?: string;
      demoDuplicate?: true;
    }
  | {
      type: "note.presence";
      eventId: string;
      noteId: string;
      viewers: Array<{ id: string; role: Role; displayName: string }>;
      at: string;
      correlationId?: string;
      demoDuplicate?: true;
    };

export type RealtimeControlMessage =
  | { type: "connected"; socketId: string; at: string }
  | { type: "subscribed"; noteIds: string[]; replayed: number }
  | { type: "replayed"; count: number }
  | { type: "error"; error: string };

export type RealtimeInbound = RealtimeEvent | RealtimeControlMessage;

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

export type RealtimeUser = {
  id: string;
  displayName: string;
  role: Role;
};

export function isRealtimeEvent(msg: RealtimeInbound): msg is RealtimeEvent {
  return (
    msg.type === "note.status_changed" ||
    msg.type === "note.version_added" ||
    msg.type === "note.presence"
  );
}
