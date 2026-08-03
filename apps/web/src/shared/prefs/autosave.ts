import { create } from "zustand";

type AutosavePreferenceState = {
  /** When false, coalesced autosave does not schedule POSTs. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

/** Preference for coalesced autosave. Lives in shared so conflict merge and
 *  keyboard shortcuts can pause it without importing the autosave feature. */
export const useAutosavePreferenceStore = create<AutosavePreferenceState>(
  (set) => ({
    enabled: true,
    setEnabled: (enabled) => set({ enabled }),
  }),
);
