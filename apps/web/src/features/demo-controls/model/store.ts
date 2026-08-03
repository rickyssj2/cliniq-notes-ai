import { create } from "zustand";

export type DemoControl = {
  id: string;
  label: string;
  onClick: () => void;
  active?: boolean;
};

type DemoControlsState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  controls: DemoControl[];
  message: string | null;
  /** Register page-scoped demo buttons; clear on unmount. */
  register: (controls: DemoControl[], message?: string | null) => void;
  setMessage: (message: string | null) => void;
  clear: () => void;
};

export const useDemoControlsStore = create<DemoControlsState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  controls: [],
  message: null,
  register: (controls, message = null) => set({ controls, message }),
  setMessage: (message) => set({ message }),
  clear: () => set({ controls: [], message: null }),
}));
