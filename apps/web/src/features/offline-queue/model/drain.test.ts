import "fake-indexeddb/auto";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@shared/api";
import { db } from "@shared/db";
import { useNoticeStore } from "@shared/notices";
import { useConnectivityStore } from "./connectivity-store";
import {
  countPendingMutations,
  enqueueCreateVersion,
  enqueueTransition,
  listDrainable,
} from "./mutation-queue";

const transitionNote = vi.hoisted(() => vi.fn());
const saveNoteVersion = vi.hoisted(() => vi.fn());
const fetchNoteDetail = vi.hoisted(() => vi.fn());
const fetchNoteVersion = vi.hoisted(() => vi.fn());
const openConflict = vi.hoisted(() => vi.fn());
const markClean = vi.hoisted(() => vi.fn());
const acknowledgeSave = vi.hoisted(() => vi.fn());
const applyResolution = vi.hoisted(() => vi.fn());

vi.mock("@entities/note", () => ({
  notesQueryKeys: {
    detail: (id: string) => ["note", id] as const,
    lists: () => ["notes"] as const,
  },
  transitionNote: (...args: unknown[]) => transitionNote(...args),
  saveNoteVersion: (...args: unknown[]) => saveNoteVersion(...args),
  fetchNoteDetail: (...args: unknown[]) => fetchNoteDetail(...args),
  fetchNoteVersion: (...args: unknown[]) => fetchNoteVersion(...args),
  reconcileDetailTransition: vi.fn(),
  useConflictStore: {
    getState: () => ({ openConflict }),
  },
  useEditorDraftStore: {
    getState: () => ({
      markClean,
      acknowledgeSave,
      applyResolution,
      drafts: {},
    }),
  },
}));

import { drainMutationQueue } from "./drain";

describe("drainMutationQueue", () => {
  beforeEach(async () => {
    await db.open();
    await db.mutationQueue.clear();
    await db.telemetryPark.clear();
    useConnectivityStore.getState().setBrowserOnline(true);
    useNoticeStore.getState().clearNotices();
    transitionNote.mockReset();
    saveNoteVersion.mockReset();
    fetchNoteDetail.mockReset();
    fetchNoteVersion.mockReset();
    openConflict.mockReset();
    markClean.mockReset();
    applyResolution.mockReset();
  });

  it("discards a rejected offline start_review with a toast and continues draining later items", async () => {
    await enqueueTransition({
      noteId: "note_claimed",
      clientMutationId: "t_start_review",
      to: "IN_REVIEW",
      actorId: "dr_b",
    });
    await enqueueCreateVersion({
      noteId: "note_other",
      clientMutationId: "v_later",
      baseVersionId: "ver_1",
      content: { sections: { S: "ok", O: "", A: "", P: "" } },
      actorId: "dr_b",
    });

    transitionNote.mockRejectedValueOnce(
      new ApiError(409, {
        error: "invalid_transition",
        reason: "No action maps IN_REVIEW → IN_REVIEW",
      }),
    );
    saveNoteVersion.mockResolvedValueOnce({
      version: { id: "ver_2", revision: 2, parentVersionId: "ver_1" },
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const result = await drainMutationQueue(qc);

    expect(result).toEqual({ drained: 1, stopped: "done" });
    expect(transitionNote).toHaveBeenCalledTimes(1);
    expect(saveNoteVersion).toHaveBeenCalledTimes(1);
    expect(await countPendingMutations()).toBe(0);
    expect(await listDrainable()).toEqual([]);
    expect(useNoticeStore.getState().items[0]?.title).toMatch(/start review/i);
  });

  it("opens the merge modal when offline SOAP hits a version conflict", async () => {
    await enqueueCreateVersion({
      noteId: "note_1",
      clientMutationId: "v_offline",
      baseVersionId: "ver_1",
      content: { sections: { S: "from B", O: "", A: "", P: "" } },
      actorId: "dr_b",
    });

    const conflictBody = {
      error: "version_conflict" as const,
      current: {
        id: "ver_2",
        revision: 2,
        parentVersionId: "ver_1",
        authoredBy: {
          id: "dr_a",
          displayName: "Dr. A",
          role: "REVIEWER" as const,
        },
        content: { sections: { S: "from A", O: "", A: "", P: "" } },
      },
      commonAncestor: {
        id: "ver_1",
        revision: 1,
        parentVersionId: null,
        content: { sections: { S: "base", O: "", A: "", P: "" } },
      },
    };
    saveNoteVersion.mockRejectedValueOnce(new ApiError(409, conflictBody));

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const result = await drainMutationQueue(qc);

    expect(result).toEqual({ drained: 0, stopped: "conflict" });
    expect(openConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: "note_1",
        source: "offline_drain",
        conflict: conflictBody,
      }),
    );
    expect(applyResolution).toHaveBeenCalled();
    expect(await countPendingMutations()).toBe(0);
    expect(useNoticeStore.getState().items[0]?.title).toMatch(/merge/i);
  });

  it("opens the merge modal when offline SOAP is forbidden after a peer claim", async () => {
    await enqueueCreateVersion({
      noteId: "note_1",
      clientMutationId: "v_offline",
      baseVersionId: "ver_1",
      content: { sections: { S: "from B", O: "", A: "", P: "" } },
      actorId: "dr_b",
    });

    saveNoteVersion.mockRejectedValueOnce(
      new ApiError(403, { error: "content_forbidden" }),
    );
    fetchNoteDetail.mockResolvedValueOnce({
      id: "note_1",
      status: "IN_REVIEW",
      currentVersion: {
        id: "ver_2",
        revision: 2,
        parentVersionId: "ver_1",
        authoredBy: {
          id: "dr_a",
          displayName: "Dr. A",
          role: "REVIEWER",
        },
        content: { sections: { S: "from A", O: "", A: "", P: "" } },
      },
    });
    fetchNoteVersion.mockResolvedValueOnce({
      id: "ver_1",
      revision: 1,
      content: { sections: { S: "base", O: "", A: "", P: "" } },
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const result = await drainMutationQueue(qc);

    expect(result).toEqual({ drained: 0, stopped: "conflict" });
    expect(openConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: "note_1",
        source: "offline_drain",
      }),
    );
    expect(await countPendingMutations()).toBe(0);
  });

  it("keeps 5xx rows for retry without blocking later successes", async () => {
    await enqueueCreateVersion({
      noteId: "note_flaky",
      clientMutationId: "v_flaky",
      baseVersionId: "ver_1",
      content: { sections: { S: "a", O: "", A: "", P: "" } },
      actorId: "dr_a",
    });
    await enqueueCreateVersion({
      noteId: "note_ok",
      clientMutationId: "v_ok",
      baseVersionId: "ver_9",
      content: { sections: { S: "b", O: "", A: "", P: "" } },
      actorId: "dr_a",
    });

    saveNoteVersion
      .mockRejectedValueOnce(new ApiError(500, { error: "chaos" }))
      .mockResolvedValueOnce({
        version: { id: "ver_10", revision: 2, parentVersionId: "ver_9" },
      });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const result = await drainMutationQueue(qc);

    expect(result).toEqual({ drained: 1, stopped: "done" });
    const left = await listDrainable();
    expect(left).toHaveLength(1);
    expect(left[0]?.clientMutationId).toBe("v_flaky");
    expect(left[0]?.status).toBe("failed");
  });
});
