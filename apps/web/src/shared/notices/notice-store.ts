import { create } from "zustand";

export type NoticeKind = "info" | "warning";

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body?: string;
  noteId?: string;
  createdAt: number;
  ttlMs: number;
};

type NoticeState = {
  items: Notice[];
  pushNotice: (
    input: Omit<Notice, "id" | "createdAt" | "ttlMs"> & { ttlMs?: number },
  ) => string;
  dismissNotice: (id: string) => void;
  clearNotices: () => void;
};

export const useNoticeStore = create<NoticeState>((set) => ({
  items: [],
  pushNotice: (input) => {
    const id = `notice_${crypto.randomUUID()}`;
    const notice: Notice = {
      id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      noteId: input.noteId,
      createdAt: Date.now(),
      ttlMs: input.ttlMs ?? 8_000,
    };
    set((s) => ({ items: [...s.items.slice(-4), notice] }));
    return id;
  },
  dismissNotice: (id) =>
    set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
  clearNotices: () => set({ items: [] }),
}));

export function pushNotice(
  input: Omit<Notice, "id" | "createdAt" | "ttlMs"> & { ttlMs?: number },
): string {
  return useNoticeStore.getState().pushNotice(input);
}
