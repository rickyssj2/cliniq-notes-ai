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
  /**
   * Server (HTTP or WS) acked a save we authored. Advances the base to the
   * new tip with exactly what the server stored, but keeps the live working
   * copy — the user may have typed more while the POST was in flight. Dirty
   * is recomputed per section, so remaining edits trigger a follow-up save.
   */
  acknowledgeSave: (
    noteId: string,
    newBaseVersionId: string,
    savedSections: Record<SoapSection, string>,
  ) => void;
  /** After conflict merge: retarget baseVersionId and mark dirty for autosave. */
  applyResolution: (input: {
    noteId: string;
    baseVersionId: string;
    sections: Record<SoapSection, string>;
  }) => void;
  /** Restore a queued offline save after reload (not dirty — already enqueued). */
  applyQueuedSnapshot: (input: {
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
      Object.values(existing.dirty).some(Boolean)
    ) {
      // Never clobber unsaved edits — even when the server tip moved.
      // Ack (acknowledgeSave) and conflict-resolve flows own base transitions.
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

  acknowledgeSave: (noteId, newBaseVersionId, savedSections) => {
    const draft = get().drafts[noteId];
    if (!draft) return;
    // HTTP ack and WS echo can both fire for the same tip — second is a no-op.
    if (draft.baseVersionId === newBaseVersionId) return;

    const baseSections = copySections(savedSections);
    set({
      drafts: {
        ...get().drafts,
        [noteId]: {
          ...draft,
          baseVersionId: newBaseVersionId,
          baseSections,
          // Keep live sections; dirty = typed-ahead divergence from the ack.
          dirty: {
            S: draft.sections.S !== baseSections.S,
            O: draft.sections.O !== baseSections.O,
            A: draft.sections.A !== baseSections.A,
            P: draft.sections.P !== baseSections.P,
          },
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

  applyQueuedSnapshot: ({ noteId, baseVersionId, sections }) => {
    const copy = copySections(sections);
    set({
      drafts: {
        ...get().drafts,
        [noteId]: {
          noteId,
          baseVersionId,
          baseSections: copySections(copy),
          sections: copy,
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
