import { create } from "zustand";
import type { Role } from "@soulside/domain";

export type PresenceViewer = {
  id: string;
  displayName: string;
  role: Role;
};

/** Stable empty list for Zustand selectors — never return a fresh `[]`. */
export const EMPTY_PRESENCE: PresenceViewer[] = [];

type PresenceState = {
  byNoteId: Record<string, PresenceViewer[]>;
  setViewers: (noteId: string, viewers: PresenceViewer[]) => void;
  clearNote: (noteId: string) => void;
};

function sameViewers(a: PresenceViewer[] | undefined, b: PresenceViewer[]) {
  if (!a) return b.length === 0;
  if (a.length !== b.length) return false;
  return a.every(
    (v, i) =>
      v.id === b[i]!.id &&
      v.displayName === b[i]!.displayName &&
      v.role === b[i]!.role,
  );
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  byNoteId: {},
  setViewers: (noteId, viewers) => {
    const prev = get().byNoteId[noteId];
    if (sameViewers(prev, viewers)) return;
    set({
      byNoteId: {
        ...get().byNoteId,
        [noteId]: viewers,
      },
    });
  },
  clearNote: (noteId) => {
    if (!(noteId in get().byNoteId)) return;
    const next = { ...get().byNoteId };
    delete next[noteId];
    set({ byNoteId: next });
  },
}));
