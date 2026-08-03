import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@shared/db";
import {
  countPendingMutations,
  enqueueCreateVersion,
  enqueueTransition,
  listDrainable,
  listPendingForNote,
} from "./mutation-queue";

describe("mutationQueue", () => {
  beforeEach(async () => {
    await db.open();
    await db.mutationQueue.clear();
    await db.telemetryPark.clear();
  });

  it("coalesces pending create_version rows per note", async () => {
    await enqueueCreateVersion({
      noteId: "note_1",
      clientMutationId: "m1",
      baseVersionId: "ver_1",
      content: { sections: { S: "a", O: "", A: "", P: "" } },
      actorId: "dr_a",
    });
    await enqueueCreateVersion({
      noteId: "note_1",
      clientMutationId: "m2",
      baseVersionId: "ver_1",
      content: { sections: { S: "b", O: "", A: "", P: "" } },
      actorId: "dr_a",
    });
    await enqueueCreateVersion({
      noteId: "note_1",
      clientMutationId: "m3",
      baseVersionId: "ver_1",
      content: { sections: { S: "c", O: "", A: "", P: "" } },
      actorId: "dr_a",
    });

    const pending = await listPendingForNote("note_1");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.clientMutationId).toBe("m3");
    const payload = pending[0]?.payload as {
      content: { sections: { S: string } };
    };
    expect(payload.content.sections.S).toBe("c");
  });

  it("keeps ordered mix of version + transitions (offline 3-mut case)", async () => {
    await enqueueCreateVersion({
      noteId: "note_1",
      clientMutationId: "v1",
      baseVersionId: "ver_1",
      content: { sections: { S: "x", O: "", A: "", P: "" } },
      actorId: "dr_a",
    });
    await enqueueTransition({
      noteId: "note_1",
      clientMutationId: "t1",
      to: "APPROVED",
      actorId: "dr_a",
      mfaVerified: true,
    });
    await enqueueCreateVersion({
      noteId: "note_2",
      clientMutationId: "v2",
      baseVersionId: "ver_9",
      content: { sections: { S: "y", O: "", A: "", P: "" } },
      actorId: "dr_a",
    });

    expect(await countPendingMutations()).toBe(3);
    const drainable = await listDrainable();
    expect(drainable.map((d) => d.clientMutationId)).toEqual(["v1", "t1", "v2"]);
  });
});
