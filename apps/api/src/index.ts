import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Server } from "node:http";
import { chaosMiddleware } from "./middleware/chaos";
import { attachRealtime } from "./realtime/hub";
import { devRoutes } from "./routes/dev";
import { notesRoutes } from "./routes/notes";
import { store } from "./store/store";

const PORT = Number(process.env.PORT ?? 3001);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
    ],
    allowHeaders: ["Content-Type", "Authorization", "X-Actor-Id"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.use("*", chaosMiddleware);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "soulside-api",
    phase: 2,
    at: new Date().toISOString(),
    store: store.info(),
  }),
);

app.route("/api/notes", notesRoutes);
app.route("/api/dev", devRoutes);

// Default seed so the API is usable without a manual seed call
if (process.env.AUTO_SEED !== "0") {
  const count = Number(process.env.SEED_COUNT ?? 5000);
  store.seed(count, Number(process.env.SEED ?? 42));
  console.log(`[api] auto-seeded ${count} notes`);
}

console.log(`[api] listening on http://localhost:${PORT}`);
console.log(`[api] websocket on ws://localhost:${PORT}/ws`);

const server = serve({
  fetch: app.fetch,
  port: PORT,
}) as Server;

attachRealtime(server);

export { app, server };
