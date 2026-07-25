export type {
  NoteStatus,
  Role,
  SoapContent,
  SoapSection,
  NoteSummary,
  NoteDetail,
  NoteVersion,
  ReviewEvent,
  CursorPage,
  CreateVersionRequest,
  CreateVersionSuccess,
  VersionConflictError,
  TransitionRequest,
  PatientRef,
  UserRef,
  VersionRef,
} from "./types";

export { NOTE_STATUSES, ROLES } from "./types";

export {
  NOTE_ACTIONS,
  AMEND_GRACE_MS,
  TRANSITIONS,
  findTransition,
  outgoingUserTransitions,
  can,
  transition,
  applyServerStatusChange,
  getAvailableActions,
  isContentReadOnly,
} from "./note-machine";

export type {
  NoteAction,
  ActorRef,
  MachineContext,
  TransitionEffect,
  TransitionSuccess,
  TransitionFailure,
  TransitionResult,
  AvailableAction,
} from "./note-machine";
