import { Hono } from "hono";
import { store } from "../store/store";
import { getChaosConfig, setChaosConfig } from "../middleware/chaos";

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

/** Helper for simulation scripts. */
devRoutes.get("/ready-note", (c) => {
  const note = store.pickReadyNote();
  if (!note) return c.json({ error: "none_ready" }, 404);
  return c.json(store.toSummary(note));
});
