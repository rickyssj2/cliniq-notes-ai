import { describe, expect, it, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { NoteDetail } from "@soulside/domain";
import { setActorIdProvider } from "@shared/api";
import { useNoticeStore } from "@shared/notices";
import { notesQueryKeys } from "../api/query-keys";
import { useEditorDraftStore } from "../model/editor-draft-store";
import { useConflictStore } from "../model/conflict-store";
import { applyRealtimeEvent } from "./apply-realtime-event";

function detailFixture(over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: "note_1",
    status: "IN_REVIEW",
    patient: { id: "pat_1", displayName: "Riley" },
    assignedReviewer: {
      id: "dr_a",
      displayName: "Dr. A",
      role: "REVIEWER",
    },
    approvedAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    currentVersion: {
      id: "ver_1",
      noteId: "note_1",
      revision: 1,
      parentVersionId: null,
      content: { sections: { S: "s", O: "o", A: "a", P: "p" } },
      authoredBy: { id: "bot", displayName: "AI", role: "CLINICIAN" },
      createdAt: "2025-01-01T00:00:00.000Z",
    },
    versions: [],
    review: { events: [] },
    ...over,
  };
}

describe("applyRealtimeEvent", () => {
  beforeEach(() => {
    useNoticeStore.getState().clearNotices();
    useConflictStore.getState().closeConflict();
    useEditorDraftStore.getState().clear("note_1");
    setActorIdProvider(() => "dr_b");
  });

  it("dedupes by eventId (at-least-once delivery)", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      notesQueryKeys.detail("note_1"),
      detailFixture({ status: "READY_FOR_REVIEW", assignedReviewer: null }),
    );

    const event = {
      type: "note.status_changed" as const,
      eventId: `evt_dup_${crypto.randomUUID()}`,
      noteId: "note_1",
      fromStatus: "READY_FOR_REVIEW" as const,
      toStatus: "IN_REVIEW" as const,
      actor: { id: "dr_a", displayName: "Dr. A", role: "REVIEWER" as const },
      at: "2025-01-01T01:00:00.000Z",
    };

    expect(applyRealtimeEvent(qc, event)).toBe(true);
    expect(applyRealtimeEvent(qc, event)).toBe(false);
    const detail = qc.getQueryData<NoteDetail>(notesQueryKeys.detail("note_1"));
    expect(detail?.status).toBe("IN_REVIEW");
    // Routine dedupe stays silent (subscribe/replay must not spam toasts).
    expect(
      useNoticeStore.getState().items.some((n) =>
        /duplicate dropped/i.test(n.title),
      ),
    ).toBe(false);
  });

  it("toasts duplicate when server marks demoDuplicate (all tabs)", () => {
    const qc = new QueryClient();
    qc.setQueryData(
      notesQueryKeys.detail("note_1"),
      detailFixture({ status: "READY_FOR_REVIEW", assignedReviewer: null }),
    );

    const event = {
      type: "note.status_changed" as const,
      eventId: `evt_demo_dup_${crypto.randomUUID()}`,
      noteId: "note_1",
      fromStatus: "READY_FOR_REVIEW" as const,
      toStatus: "IN_REVIEW" as const,
      actor: { id: "dr_a", displayName: "Dr. A", role: "REVIEWER" as const },
      at: "2025-01-01T01:00:00.000Z",
    };

    expect(applyRealtimeEvent(qc, event)).toBe(true);
    expect(
      applyRealtimeEvent(qc, { ...event, demoDuplicate: true as const }),
    ).toBe(false);
    expect(
      useNoticeStore.getState().items.some((n) =>
        /duplicate dropped/i.test(n.title),
      ),
    ).toBe(true);
  });

  it("caps seen-event memory (evicts oldest so session cannot grow forever)", () => {
    const qc = new QueryClient();
    const first = {
      type: "note.status_changed" as const,
      eventId: `evt_first_${crypto.randomUUID()}`,
      noteId: "note_leak",
      fromStatus: "READY_FOR_REVIEW" as const,
      toStatus: "IN_REVIEW" as const,
      actor: { id: "dr_a", displayName: "Dr. A", role: "REVIEWER" as const },
      at: "2025-01-01T01:00:00.000Z",
    };
    expect(applyRealtimeEvent(qc, first)).toBe(true);

    for (let i = 0; i < 2000; i++) {
      applyRealtimeEvent(qc, {
        ...first,
        eventId: `evt_cap_${i}`,
        noteId: `note_${i}`,
      });
    }

    // After cap eviction, the original id can be applied again.
    expect(applyRealtimeEvent(qc, first)).toBe(true);
  });

  it("toasts when a foreign version silently hydrates a clean draft", () => {
    const qc = new QueryClient();
    qc.setQueryData(notesQueryKeys.detail("note_1"), detailFixture());
    useEditorDraftStore.getState().hydrate({
      noteId: "note_1",
      baseVersionId: "ver_1",
      content: { sections: { S: "s", O: "o", A: "a", P: "p" } },
    });

    applyRealtimeEvent(qc, {
      type: "note.version_added",
      eventId: `evt_ver_${crypto.randomUUID()}`,
      noteId: "note_1",
      version: {
        id: "ver_2",
        revision: 2,
        parentVersionId: "ver_1",
        content: { sections: { S: "admin edit", O: "o", A: "a", P: "p" } },
        authoredBy: {
          id: "admin_1",
          displayName: "Admin",
          role: "ADMIN",
        },
      },
      at: "2025-01-01T02:00:00.000Z",
    });

    const notices = useNoticeStore.getState().items;
    expect(notices).toHaveLength(1);
    expect(notices[0]?.title).toMatch(/SOAP updated/i);
    expect(notices[0]?.body).toMatch(/Admin/);
    const detail = qc.getQueryData<NoteDetail>(notesQueryKeys.detail("note_1"));
    expect(detail?.currentVersion.id).toBe("ver_2");
  });

  it("opens merge modal instead of toast when the local draft is dirty", () => {
    const qc = new QueryClient();
    qc.setQueryData(notesQueryKeys.detail("note_1"), detailFixture());
    useEditorDraftStore.getState().hydrate({
      noteId: "note_1",
      baseVersionId: "ver_1",
      content: { sections: { S: "s", O: "o", A: "a", P: "p" } },
    });
    useEditorDraftStore.getState().setSection("note_1", "S", "local dirty");

    applyRealtimeEvent(qc, {
      type: "note.version_added",
      eventId: `evt_dirty_${crypto.randomUUID()}`,
      noteId: "note_1",
      version: {
        id: "ver_2",
        revision: 2,
        parentVersionId: "ver_1",
        content: { sections: { S: "admin edit", O: "o", A: "a", P: "p" } },
        authoredBy: {
          id: "admin_1",
          displayName: "Admin",
          role: "ADMIN",
        },
      },
      at: "2025-01-01T02:00:00.000Z",
    });

    expect(useConflictStore.getState().open?.source).toBe("realtime");
    expect(useNoticeStore.getState().items).toHaveLength(0);
  });

  it("treats own slow-save echo as ack, not conflict, when user typed ahead", () => {
    // dr_b saved "first save"; while POST was slow, they typed more.
    const qc = new QueryClient();
    qc.setQueryData(notesQueryKeys.detail("note_1"), detailFixture());
    useEditorDraftStore.getState().hydrate({
      noteId: "note_1",
      baseVersionId: "ver_1",
      content: { sections: { S: "first save", O: "o", A: "a", P: "p" } },
    });
    useEditorDraftStore
      .getState()
      .setSection("note_1", "S", "first save plus typed-ahead");

    applyRealtimeEvent(qc, {
      type: "note.version_added",
      eventId: `evt_own_${crypto.randomUUID()}`,
      noteId: "note_1",
      version: {
        id: "ver_2",
        revision: 2,
        parentVersionId: "ver_1",
        content: { sections: { S: "first save", O: "o", A: "a", P: "p" } },
        authoredBy: { id: "dr_b", displayName: "Dr. B", role: "REVIEWER" },
      },
      at: "2025-01-01T02:00:00.000Z",
    });

    // No conflict, no toast; base advanced; typed-ahead text preserved + dirty.
    expect(useConflictStore.getState().open).toBeNull();
    expect(useNoticeStore.getState().items).toHaveLength(0);
    const draft = useEditorDraftStore.getState().drafts.note_1;
    expect(draft?.baseVersionId).toBe("ver_2");
    expect(draft?.sections.S).toBe("first save plus typed-ahead");
    expect(draft?.dirty.S).toBe(true);
    expect(draft?.dirty.O).toBe(false);
  });

  it("ignores stale echo of an older save after a newer tip is cached", () => {
    const qc = new QueryClient();
    const detail = detailFixture({
      currentVersion: {
        id: "ver_3",
        noteId: "note_1",
        revision: 3,
        parentVersionId: "ver_2",
        content: { sections: { S: "newest", O: "o", A: "a", P: "p" } },
        authoredBy: { id: "dr_b", displayName: "Dr. B", role: "REVIEWER" },
        createdAt: "2025-01-01T03:00:00.000Z",
      },
    });
    qc.setQueryData(notesQueryKeys.detail("note_1"), detail);
    useEditorDraftStore.getState().hydrate({
      noteId: "note_1",
      baseVersionId: "ver_3",
      content: { sections: { S: "newest", O: "o", A: "a", P: "p" } },
    });

    // Late WS echo of the older ver_2 save arrives after ver_3 acked.
    applyRealtimeEvent(qc, {
      type: "note.version_added",
      eventId: `evt_stale_${crypto.randomUUID()}`,
      noteId: "note_1",
      version: {
        id: "ver_2",
        revision: 2,
        parentVersionId: "ver_1",
        content: { sections: { S: "older", O: "o", A: "a", P: "p" } },
        authoredBy: { id: "dr_b", displayName: "Dr. B", role: "REVIEWER" },
      },
      at: "2025-01-01T02:30:00.000Z",
    });

    // Cache and draft must not regress to the older version.
    const after = qc.getQueryData<NoteDetail>(notesQueryKeys.detail("note_1"));
    expect(after?.currentVersion.id).toBe("ver_3");
    expect(after?.currentVersion.content.sections.S).toBe("newest");
    const draft = useEditorDraftStore.getState().drafts.note_1;
    expect(draft?.baseVersionId).toBe("ver_3");
    expect(useConflictStore.getState().open).toBeNull();
  });
});
