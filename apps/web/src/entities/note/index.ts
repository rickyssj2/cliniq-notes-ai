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

export {
  notesQueryKeys,
  type NotesListParams,
  type NotesSortField,
  type NotesSortOrder,
} from "./api/query-keys";
export {
  fetchNotesPage,
  fetchNoteDetail,
  transitionNote,
  fetchDevUsers,
  type DevUser,
} from "./api/notes-api";
export {
  useNotesInfiniteQuery,
  usePatchNoteInLists,
  flattenNotesPages,
  type NotesFilterState,
} from "./api/use-notes-query";
export { useNoteSelectionStore } from "./model/selection-store";
export { NoteStatusBadge } from "./ui/NoteStatusBadge";
