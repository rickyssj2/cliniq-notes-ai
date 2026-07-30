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
  canEditContent,
  NOTE_ACTIONS,
  AMEND_GRACE_MS,
} from "@soulside/domain";

export {
  notesQueryKeys,
  type NotesListParams,
  type NotesFilterState,
  type NotesSortField,
  type NotesSortOrder,
} from "./api/query-keys";
export {
  fetchNotesPage,
  fetchNoteDetail,
  fetchNoteVersion,
  transitionNote,
  saveNoteVersion,
  setDevFailNext,
  fetchDevUsers,
  type DevUser,
} from "./api/notes-api";
export {
  useNotesInfiniteQuery,
  usePatchNoteInLists,
  flattenNotesPages,
} from "./api/use-notes-query";
export { useNoteDetailQuery } from "./api/use-note-detail";
export { useNoteVersionQuery } from "./api/use-note-version";
export { useDevUsersQuery } from "./api/use-dev-users-query";
export { useNoteSelectionStore } from "./model/selection-store";
export {
  useEditorDraftStore,
  isDraftDirty,
  type EditorDraft,
} from "./model/editor-draft-store";
export {
  usePresenceStore,
  EMPTY_PRESENCE,
  type PresenceViewer,
} from "./model/presence-store";
export {
  useConflictStore,
  type ConflictPayload,
} from "./model/conflict-store";
export { applyRealtimeEvent } from "./lib/apply-realtime-event";
export { NoteStatusBadge } from "./ui/NoteStatusBadge";
