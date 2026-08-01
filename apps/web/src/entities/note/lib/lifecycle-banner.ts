import {
  isContentReadOnly,
  outgoingUserTransitions,
  type NoteStatus,
} from "@soulside/domain";

/**
 * Screen copy for a note that is locked by status with nothing the actor can
 * do about it. Which statuses those are is the machine's call; how we word it
 * is ours — components read this instead of branching on status strings.
 */
export function getLifecycleBanner(status: NoteStatus): string | null {
  if (!isContentReadOnly(status)) return null;
  if (outgoingUserTransitions(status).length > 0) return null;

  switch (status) {
    case "LOCKED":
      return "This note is LOCKED after the 24h amendment grace window. Content is read-only; start a new clinical note if changes are required.";
    case "GENERATING":
      return "Note is generating. Content is read-only until generation completes.";
    default:
      return null;
  }
}
