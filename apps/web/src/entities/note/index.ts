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
  saveNoteVersion,
  setDevFailNext,
  fetchDevUsers,
  type DevUser,
} from "./api/notes-api";
export {
  useNotesInfiniteQuery,
  usePatchNoteInLists,
  flattenNotesPages,
  type NotesFilterState,
} from "./api/use-notes-query";
export { useNoteDetailQuery } from "./api/use-note-detail";
export { useNoteSelectionStore } from "./model/selection-store";
export {
  useEditorDraftStore,
  isDraftDirty,
  type EditorDraft,
} from "./model/editor-draft-store";
export { NoteStatusBadge } from "./ui/NoteStatusBadge";
