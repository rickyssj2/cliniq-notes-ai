import { create } from "zustand";

type SelectionState = {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], selected: boolean) => void;
  clear: () => void;
  /** Drop ids that are no longer known to the client (optional prune). */
  retainOnly: (ids: Iterable<string>) => void;
};

export const useNoteSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: new Set(),
  toggle: (id) => {
    const next = new Set(get().selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selectedIds: next });
  },
  setMany: (ids, selected) => {
    const next = new Set(get().selectedIds);
    for (const id of ids) {
      if (selected) next.add(id);
      else next.delete(id);
    }
    set({ selectedIds: next });
  },
  clear: () => set({ selectedIds: new Set() }),
  retainOnly: (ids) => {
    const allow = new Set(ids);
    const next = new Set([...get().selectedIds].filter((id) => allow.has(id)));
    set({ selectedIds: next });
  },
}));
