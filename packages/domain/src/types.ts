export const NOTE_STATUSES = [
  "GENERATING",
  "READY_FOR_REVIEW",
  "IN_REVIEW",
  "APPROVED",
  "LOCKED",
  "FAILED",
  "REJECTED",
  "AMENDED",
] as const;

export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const ROLES = [
  "CLINICIAN",
  "REVIEWER",
  "ADMIN",
  "READONLY_AUDITOR",
] as const;

export type Role = (typeof ROLES)[number];

export type SoapSection = "S" | "O" | "A" | "P";

export type SoapContent = {
  sections: Record<SoapSection, string>;
};

export type PatientRef = {
  id: string;
  displayName: string;
};

export type UserRef = {
  id: string;
  displayName: string;
  role: Role;
};

export type VersionRef = {
  id: string;
  revision: number;
  parentVersionId?: string | null;
};

export type NoteSummary = {
  id: string;
  patient: PatientRef;
  status: NoteStatus;
  currentVersion: VersionRef;
  assignedReviewer: UserRef | null;
  /** Present when status is/was APPROVED — drives amend grace checks. */
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteVersion = VersionRef & {
  noteId: string;
  content: SoapContent;
  authoredBy: UserRef;
  createdAt: string;
};

export type ReviewEvent = {
  id: string;
  noteId: string;
  versionId: string | null;
  fromStatus: NoteStatus | null;
  toStatus: NoteStatus;
  actorId: string;
  actorRole: Role;
  reason?: string;
  occurredAt: string;
};

export type NoteDetail = NoteSummary & {
  currentVersion: NoteVersion;
  versions: Array<
    VersionRef & {
      authoredBy: UserRef;
      createdAt: string;
    }
  >;
  review: {
    events: ReviewEvent[];
  };
};

export type CursorPage<T> = {
  cursor: {
    next: string | null;
    hasMore: boolean;
  };
  items: T[];
  meta: {
    total: number;
    returned: number;
    generatedAt: string;
  };
};

export type CreateVersionRequest = {
  baseVersionId: string;
  content: SoapContent;
  clientMutationId: string;
};

export type CreateVersionSuccess = {
  version: VersionRef & {
    parentVersionId: string;
  };
};

export type VersionConflictError = {
  error: "version_conflict";
  current: VersionRef & {
    authoredBy: UserRef;
    content: SoapContent;
  };
  commonAncestor: VersionRef & {
    content: SoapContent;
  };
};

export type TransitionRequest = {
  to: NoteStatus;
  actorId: string;
  reason?: string;
  clientMutationId?: string;
};
