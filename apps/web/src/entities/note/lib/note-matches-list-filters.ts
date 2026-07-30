import type { NoteSummary } from "@soulside/domain";
import type { NotesFilterState } from "../api/query-keys";

/** Best-effort client filter match for optimistic list patches. */
export function noteMatchesListFilters(
  note: NoteSummary,
  params: NotesFilterState,
): boolean {
  if (params.statuses.length > 0 && !params.statuses.includes(note.status)) {
    return false;
  }
  if (
    params.reviewerId &&
    (note.assignedReviewer?.id ?? null) !== params.reviewerId
  ) {
    return false;
  }
  if (params.patientId && note.patient.id !== params.patientId) {
    return false;
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    const hay = `${note.patient.displayName} ${note.id}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (params.updatedFrom) {
    if (Date.parse(note.updatedAt) < Date.parse(params.updatedFrom)) {
      return false;
    }
  }
  if (params.updatedTo) {
    if (Date.parse(note.updatedAt) > Date.parse(params.updatedTo)) {
      return false;
    }
  }
  return true;
}
