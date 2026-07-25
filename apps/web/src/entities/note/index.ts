export type {
  NoteStatus,
  NoteSummary,
  NoteDetail,
  NoteAction,
  AvailableAction,
  MachineContext,
  TransitionResult,
} from "@soulside/domain";

export {
  can,
  transition,
  applyServerStatusChange,
  getAvailableActions,
  isContentReadOnly,
  NOTE_ACTIONS,
  AMEND_GRACE_MS,
} from "@soulside/domain";
