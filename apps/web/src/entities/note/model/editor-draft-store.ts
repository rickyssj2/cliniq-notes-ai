import { create } from "zustand";
import type { SoapContent, SoapSection } from "@soulside/domain";

export type EditorDraft = {
  noteId: string;
  baseVersionId: string;
  sections: Record<SoapSection, string>;
  dirty: Record<SoapSection, boolean>;
};

type EditorDraftState = {
  drafts: Record<string, EditorDraft>;
  hydrate: (input: {
    noteId: string;
    baseVersionId: string;
    content: SoapContent;
    force?: boolean;
  }) => void;
  setSection: (noteId: string, section: SoapSection, value: string) => void;
  markClean: (noteId: string, baseVersionId: string) => void;
  clear: (noteId: string) => void;
  getDraft: (noteId: string) => EditorDraft | undefined;
};

const emptyDirty = (): Record<SoapSection, boolean> => ({
  S: false,
  O: false,
  A: false,
  P: false,
});

export const useEditorDraftStore = create<EditorDraftState>((set, get) => ({
  drafts: {},

  hydrate: ({ noteId, baseVersionId, content, force }) => {
    const existing = get().drafts[noteId];
    if (
      !force &&
      existing &&
      existing.baseVersionId === baseVersionId &&
      Object.values(existing.dirty).some(Boolean)
    ) {
      // Keep in-progress edits for the same head version.
      return;
    }
    set({
      drafts: {
        ...get().drafts,
        [noteId]: {
          noteId,
          baseVersionId,
          sections: {
            S: content.sections.S,
            O: content.sections.O,
            A: content.sections.A,
            P: content.sections.P,
          },
          dirty: emptyDirty(),
        },
      },
    });
  },

  setSection: (noteId, section, value) => {
    const draft = get().drafts[noteId];
    if (!draft) return;
    set({
      drafts: {
        ...get().drafts,
        [noteId]: {
          ...draft,
          sections: { ...draft.sections, [section]: value },
          dirty: { ...draft.dirty, [section]: true },
        },
      },
    });
  },

  markClean: (noteId, baseVersionId) => {
    const draft = get().drafts[noteId];
    if (!draft) return;
    set({
      drafts: {
        ...get().drafts,
        [noteId]: {
          ...draft,
          baseVersionId,
          dirty: emptyDirty(),
        },
      },
    });
  },

  clear: (noteId) => {
    const next = { ...get().drafts };
    delete next[noteId];
    set({ drafts: next });
  },

  getDraft: (noteId) => get().drafts[noteId],
}));

export function isDraftDirty(draft: EditorDraft | undefined): boolean {
  if (!draft) return false;
  return Object.values(draft.dirty).some(Boolean);
}
