import type {
  NoteStatus,
  NoteVersion,
  PatientRef,
  ReviewEvent,
  Role,
  SoapContent,
  UserRef,
} from "@soulside/domain";

export type StoredUser = UserRef;

export type StoredNote = {
  id: string;
  patient: PatientRef;
  sessionId: string;
  status: NoteStatus;
  currentVersionId: string;
  assignedReviewerId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredVersion = NoteVersion;

export type StoredReviewEvent = ReviewEvent;

export type RealtimeEvent =
  | {
      type: "note.status_changed";
      eventId: string;
      noteId: string;
      fromStatus: NoteStatus;
      toStatus: NoteStatus;
      actor: UserRef;
      at: string;
    }
  | {
      type: "note.version_added";
      eventId: string;
      noteId: string;
      version: { id: string; revision: number; parentVersionId: string | null };
      at: string;
    }
  | {
      type: "note.presence";
      eventId: string;
      noteId: string;
      viewers: Array<{ id: string; role: Role; displayName: string }>;
      at: string;
    };

export type MutationRecord = {
  clientMutationId: string;
  status: number;
  body: unknown;
};

export type PresenceViewer = {
  userId: string;
  displayName: string;
  role: Role;
  socketId: string;
};
