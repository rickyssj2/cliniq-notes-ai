import { create } from "zustand";
import type { VersionConflictError } from "@soulside/domain";
import type { EditorDraft } from "./editor-draft-store";

export type ConflictPayload = {
  noteId: string;
  conflict: VersionConflictError;
  yours: EditorDraft;
  source: "save" | "realtime";
};

type ConflictState = {
  open: ConflictPayload | null;
  openConflict: (payload: ConflictPayload) => void;
  closeConflict: () => void;
};

export const useConflictStore = create<ConflictState>((set) => ({
  open: null,
  openConflict: (payload) => set({ open: payload }),
  closeConflict: () => set({ open: null }),
}));
