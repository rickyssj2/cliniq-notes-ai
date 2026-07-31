import { Hono } from "hono";
import { store } from "../store/store";
import { getChaosConfig, setChaosConfig } from "../middleware/chaos";
import { rebroadcastRealtimeEvent } from "../realtime/hub";

export const devRoutes = new Hono();

devRoutes.post("/seed", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    count?: number;
    seed?: number;
  };
  const count = Math.min(Math.max(body.count ?? 100_000, 1), 100_000);
  const seed = body.seed ?? 42;
  const result = store.seed(count, seed);
  return c.json({ ok: true, ...result, info: store.info() });
});

devRoutes.get("/info", (c) => c.json(store.info()));

devRoutes.get("/users", (c) => c.json({ items: store.listUsers() }));

devRoutes.get("/chaos", (c) => c.json(getChaosConfig()));

devRoutes.post("/chaos", async (c) => {
  const body = await c.req.json();
  setChaosConfig(body);
  return c.json(getChaosConfig());
});

/**
 * Demo: re-send the last logged realtime event with the SAME eventId
 * (at-least-once duplicate). Does not mint a new event or mutate notes.
 */
devRoutes.post("/realtime/duplicate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    noteId?: string;
  };
  const noteId =
    typeof body.noteId === "string" && body.noteId.trim()
      ? body.noteId.trim()
      : undefined;
  const event = store.lastRealtimeEvent(noteId);
  if (!event) {
    return c.json(
      {
        error: "no_event",
        reason: noteId
          ? `No realtime events logged for ${noteId} yet — save or transition first.`
          : "Realtime log is empty — interact with a note first.",
      },
      404,
    );
  }
  const recipients = rebroadcastRealtimeEvent(event);
  return c.json({
    ok: true,
    eventId: event.eventId,
    type: event.type,
    noteId: event.noteId,
    recipients,
  });
});

/** Helper for simulation scripts. */
devRoutes.get("/ready-note", (c) => {
  const note = store.pickReadyNote();
  if (!note) return c.json({ error: "none_ready" }, 404);
  return c.json(store.toSummary(note));
});
