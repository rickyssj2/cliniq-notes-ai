import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

const PORT = Number(process.env.PORT ?? 3001);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "soulside-api",
    phase: 0,
    at: new Date().toISOString(),
  }),
);

console.log(`[api] listening on http://localhost:${PORT}`);

serve({
  fetch: app.fetch,
  port: PORT,
});
