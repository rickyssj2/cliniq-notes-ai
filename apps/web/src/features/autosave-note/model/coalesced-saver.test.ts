import { describe, expect, it, vi } from "vitest";
import { createCoalescedSaver } from "./coalesced-saver";

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("createCoalescedSaver", () => {
  it("debounces and sends one save", async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    const saver = createCoalescedSaver({
      debounceMs: 30,
      mintMutationId: () => "m1",
      save,
    });
    saver.schedule();
    saver.schedule();
    saver.schedule();
    await wait(50);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("m1");
    expect(saver.getStatus()).toBe("saved");
  });

  it("queues one follow-up while in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const ids: string[] = [];
    const save = vi.fn(async (id: string) => {
      ids.push(id);
      if (ids.length === 1) await gate;
      return { ok: true as const };
    });
    const saver = createCoalescedSaver({
      debounceMs: 10,
      mintMutationId: () => `m_${ids.length}`,
      save,
    });
    saver.schedule();
    await wait(20);
    expect(save).toHaveBeenCalledTimes(1);
    saver.schedule();
    saver.schedule();
    release();
    await wait(40);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reuses mutation id after error until success", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        kind: "error" as const,
        message: "boom",
      })
      .mockResolvedValueOnce({ ok: true as const });
    const saver = createCoalescedSaver({
      debounceMs: 5,
      mintMutationId: () => "stable",
      save,
    });
    await saver.flushNow();
    expect(saver.getStatus()).toBe("error");
    await saver.flushNow();
    expect(save).toHaveBeenNthCalledWith(1, "stable");
    expect(save).toHaveBeenNthCalledWith(2, "stable");
    expect(saver.getStatus()).toBe("saved");
  });
});
