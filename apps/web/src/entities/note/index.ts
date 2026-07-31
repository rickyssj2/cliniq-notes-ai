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
  getLifecycleBanner,
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
  setDevChaos,
  fetchDevChaos,
  fetchDevUsers,
  type DevUser,
} from "./api/notes-api";
export {
  useNotesInfiniteQuery,
  usePatchNoteInLists,
  flattenNotesPages,
  NOTES_PAGE_SIZE,
  NOTES_LIST_MAX_PAGES,
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
  type ConflictSource,
} from "./model/conflict-store";
export { applyRealtimeEvent } from "./lib/apply-realtime-event";
export {
  applyOptimisticDetailTransition,
  reconcileDetailTransition,
  rollbackDetailTransition,
  localReviewEventId,
  isLocalReviewEventId,
  mergeReviewEvent,
  reconcileLocalReviewEvent,
} from "./lib/optimistic-transition";
export { NoteStatusBadge } from "./ui/NoteStatusBadge";
