import { Hono } from "hono";
import { consumeFailNext } from "../middleware/chaos";

export type IngestedTelemetryEvent = {
  id: string;
  name: string;
  props: Record<string, unknown>;
  important?: boolean;
  at: string;
};

type TelemetryBatch = {
  batchId: string;
  receivedAt: string;
  events: IngestedTelemetryEvent[];
};

const batches: TelemetryBatch[] = [];
const MAX_BATCHES = 100;

export const telemetryRoutes = new Hono();

telemetryRoutes.post("/batch", async (c) => {
  if (consumeFailNext("telemetry")) {
    return c.json(
      {
        error: "injected_failure",
        message: "Simulated 500 on telemetry batch (fail-next)",
      },
      500,
    );
  }

  const body = (await c.req.json().catch(() => null)) as {
    batchId?: string;
    events?: IngestedTelemetryEvent[];
  } | null;

  if (!body?.batchId || !Array.isArray(body.events)) {
    return c.json({ error: "invalid_body" }, 400);
  }

  // Reject free-text props if a client forgets to redact (defense in depth).
  for (const event of body.events) {
    if (!event?.name || typeof event.name !== "string") {
      return c.json({ error: "invalid_event" }, 400);
    }
    const props = event.props ?? {};
    for (const key of Object.keys(props)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        return c.json(
          {
            error: "pii_rejected",
            message: `Prop "${key}" looks like note free text — redact on client`,
          },
          400,
        );
      }
    }
  }

  batches.unshift({
    batchId: body.batchId,
    receivedAt: new Date().toISOString(),
    events: body.events,
  });
  if (batches.length > MAX_BATCHES) batches.length = MAX_BATCHES;

  return c.json({
    ok: true,
    accepted: body.events.length,
    batchId: body.batchId,
  });
});

telemetryRoutes.get("/recent", (c) =>
  c.json({
    batches: batches.slice(0, 20).map((b) => ({
      batchId: b.batchId,
      receivedAt: b.receivedAt,
      count: b.events.length,
      names: b.events.map((e) => e.name),
    })),
    totalBatches: batches.length,
  }),
);

const SENSITIVE_KEYS = new Set([
  "content",
  "sections",
  "section",
  "text",
  "body",
  "draft",
  "s",
  "o",
  "a",
  "p",
  "subjective",
  "objective",
  "assessment",
  "plan",
  "noteText",
  "soap",
]);
