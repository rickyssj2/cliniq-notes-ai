import { create } from "zustand";

type AutosavePreferenceState = {
  /** When false, coalesced autosave does not schedule POSTs. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

/** Shared so conflict “Keep editing” can pause autosave and stop the modal loop. */
export const useAutosavePreferenceStore = create<AutosavePreferenceState>(
  (set) => ({
    enabled: true,
    setEnabled: (enabled) => set({ enabled }),
  }),
);
