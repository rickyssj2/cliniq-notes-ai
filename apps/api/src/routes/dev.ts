import { Hono } from "hono";
import { store } from "../store/store";
import { getChaosConfig, setChaosConfig } from "../middleware/chaos";
import { rebroadcastRealtimeEvent } from "../realtime/hub";
import { DEV_TOKEN_TTL_SEC, signActorToken } from "../auth/jwt";

export const devRoutes = new Hono();

/**
 * Mint a short-lived HS256 JWT for a known seeded actor.
 * Demo-only: no password — proves server-issued identity, not a real IdP.
 */
devRoutes.post("/token", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    actorId?: string;
  };
  const actorId =
    typeof body.actorId === "string" && body.actorId.trim()
      ? body.actorId.trim()
      : "";
  if (!actorId) {
    return c.json({ error: "actorId_required" }, 400);
  }
  const user = store.listUsers().find((u) => u.id === actorId);
  if (!user) {
    return c.json({ error: "unknown_actor", actorId }, 400);
  }
  const accessToken = await signActorToken({
    actorId: user.id,
    role: user.role,
  });
  return c.json({
    accessToken,
    tokenType: "Bearer",
    expiresIn: DEV_TOKEN_TTL_SEC,
    actor: { id: user.id, displayName: user.displayName, role: user.role },
  });
});

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
