import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { NoteDetail } from "@soulside/domain";
import { notesQueryKeys } from "../api/query-keys";
import { applyRealtimeEvent } from "./apply-realtime-event";

function detailFixture(over: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: "note_1",
    status: "READY_FOR_REVIEW",
    patient: { id: "pat_1", displayName: "Riley" },
    assignedReviewer: null,
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
  it("dedupes by eventId (at-least-once delivery)", () => {
    const qc = new QueryClient();
    qc.setQueryData(notesQueryKeys.detail("note_1"), detailFixture());

    const event = {
      type: "note.status_changed" as const,
      eventId: "evt_dup",
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
  });

  it("caps seen-event memory (evicts oldest so session cannot grow forever)", () => {
    const qc = new QueryClient();
    const first = {
      type: "note.status_changed" as const,
      eventId: "evt_first",
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
        eventId: `evt_${i}`,
        noteId: `note_${i}`,
      });
    }

    // After cap eviction, the original id can be applied again.
    expect(applyRealtimeEvent(qc, first)).toBe(true);
  });
});
