import { create } from "zustand";
import type { SoapContent, SoapSection } from "@soulside/domain";

export type EditorDraft = {
  noteId: string;
  baseVersionId: string;
  /** Snapshot of sections when baseVersionId was established (common ancestor). */
  baseSections: Record<SoapSection, string>;
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
  /** After conflict merge: retarget baseVersionId and mark dirty for autosave. */
  applyResolution: (input: {
    noteId: string;
    baseVersionId: string;
    sections: Record<SoapSection, string>;
  }) => void;
  clear: (noteId: string) => void;
  getDraft: (noteId: string) => EditorDraft | undefined;
};

const emptyDirty = (): Record<SoapSection, boolean> => ({
  S: false,
  O: false,
  A: false,
  P: false,
});

function copySections(
  sections: Record<SoapSection, string>,
): Record<SoapSection, string> {
  return {
    S: sections.S,
    O: sections.O,
    A: sections.A,
    P: sections.P,
  };
}

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
    if (
      !force &&
      existing &&
      existing.baseVersionId === baseVersionId &&
      !Object.values(existing.dirty).some(Boolean) &&
      existing.sections.S === content.sections.S &&
      existing.sections.O === content.sections.O &&
      existing.sections.A === content.sections.A &&
      existing.sections.P === content.sections.P
    ) {
      return;
    }
    const sections = copySections(content.sections);
    set({
      drafts: {
        ...get().drafts,
        [noteId]: {
          noteId,
          baseVersionId,
          baseSections: copySections(sections),
          sections,
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
    const sections = copySections(draft.sections);
    set({
      drafts: {
        ...get().drafts,
        [noteId]: {
          ...draft,
          baseVersionId,
          baseSections: sections,
          sections,
          dirty: emptyDirty(),
        },
      },
    });
  },

  applyResolution: ({ noteId, baseVersionId, sections }) => {
    const existing = get().drafts[noteId];
    set({
      drafts: {
        ...get().drafts,
        [noteId]: {
          noteId,
          baseVersionId,
          baseSections: existing?.baseSections ?? copySections(sections),
          sections: { ...sections },
          dirty: { S: true, O: true, A: true, P: true },
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
