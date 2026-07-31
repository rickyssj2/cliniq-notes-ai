import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { NoteDetail, ReviewEvent } from "@soulside/domain";
import { notesQueryKeys } from "../api/query-keys";
import {
  applyOptimisticDetailTransition,
  localReviewEventId,
  mergeReviewEvent,
  reconcileDetailTransition,
  reconcileLocalReviewEvent,
  rollbackDetailTransition,
} from "./optimistic-transition";

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

const actor = {
  id: "dr_a",
  displayName: "Dr. A",
  role: "REVIEWER" as const,
};

describe("optimistic ReviewEvent reconcile", () => {
  it("emits local_* event then swaps to server eventId on ack", () => {
    const qc = new QueryClient();
    const note = detailFixture();
    qc.setQueryData(notesQueryKeys.detail(note.id), note);
    const clientMutationId = "ui_start_review_1";

    applyOptimisticDetailTransition(qc, {
      note,
      to: "IN_REVIEW",
      action: "start_review",
      actor,
      clientMutationId,
      at: "2025-01-01T01:00:00.000Z",
    });

    const afterOpt = qc.getQueryData<NoteDetail>(notesQueryKeys.detail(note.id));
    expect(afterOpt?.status).toBe("IN_REVIEW");
    expect(afterOpt?.review.events).toHaveLength(1);
    expect(afterOpt?.review.events[0]?.id).toBe(
      localReviewEventId(clientMutationId),
    );

    const serverEvent: ReviewEvent = {
      id: "evt_server_1",
      noteId: note.id,
      versionId: "ver_1",
      fromStatus: "READY_FOR_REVIEW",
      toStatus: "IN_REVIEW",
      actorId: actor.id,
      actorRole: actor.role,
      occurredAt: "2025-01-01T01:00:01.000Z",
    };

    reconcileDetailTransition(qc, {
      noteId: note.id,
      clientMutationId,
      note: {
        status: "IN_REVIEW",
        assignedReviewer: actor,
        approvedAt: null,
        updatedAt: serverEvent.occurredAt,
      },
      event: serverEvent,
    });

    const afterAck = qc.getQueryData<NoteDetail>(notesQueryKeys.detail(note.id));
    expect(afterAck?.review.events).toEqual([serverEvent]);
  });

  it("rolls back detail to snapshot on reject", () => {
    const qc = new QueryClient();
    const note = detailFixture();
    qc.setQueryData(notesQueryKeys.detail(note.id), note);
    const snapshot = applyOptimisticDetailTransition(qc, {
      note,
      to: "IN_REVIEW",
      action: "start_review",
      actor,
      clientMutationId: "ui_fail",
    });
    expect(snapshot).toBeTruthy();
    rollbackDetailTransition(qc, note.id, snapshot!);
    expect(qc.getQueryData<NoteDetail>(notesQueryKeys.detail(note.id))).toEqual(
      snapshot,
    );
  });

  it("mergeReviewEvent replaces matching local row when WS arrives first", () => {
    const local: ReviewEvent = {
      id: localReviewEventId("m1"),
      noteId: "note_1",
      versionId: "ver_1",
      fromStatus: "READY_FOR_REVIEW",
      toStatus: "IN_REVIEW",
      actorId: "dr_a",
      actorRole: "REVIEWER",
      occurredAt: "2025-01-01T01:00:00.000Z",
    };
    const server: ReviewEvent = {
      ...local,
      id: "evt_ws_1",
      occurredAt: "2025-01-01T01:00:01.000Z",
    };
    expect(mergeReviewEvent([local], server)).toEqual([server]);
    expect(reconcileLocalReviewEvent([local], "m1", server)).toEqual([server]);
  });
});
