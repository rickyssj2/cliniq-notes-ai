import { Hono } from "hono";
import type { NoteStatus } from "@soulside/domain";
import { NOTE_STATUSES } from "@soulside/domain";
import { store } from "../store/store";
import { shouldForceConflict } from "../middleware/chaos";

export const notesRoutes = new Hono();

function parseStatuses(raw: string | undefined): NoteStatus[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = parts.filter((p): p is NoteStatus =>
    (NOTE_STATUSES as readonly string[]).includes(p),
  );
  return valid.length ? valid : undefined;
}

notesRoutes.get("/", (c) => {
  const page = store.listNotes({
    cursor: c.req.query("cursor"),
    limit: Number(c.req.query("limit") ?? 50),
    statuses: parseStatuses(c.req.query("status") ?? c.req.query("statuses")),
    reviewerId: c.req.query("reviewerId"),
    patientId: c.req.query("patientId"),
    q: c.req.query("q"),
    sort: (c.req.query("sort") as "updatedAt" | "createdAt" | "status") ?? "updatedAt",
    order: (c.req.query("order") as "asc" | "desc") ?? "desc",
    updatedFrom: c.req.query("updatedFrom"),
    updatedTo: c.req.query("updatedTo"),
  });
  return c.json(page);
});

notesRoutes.get("/:id", (c) => {
  const detail = store.getNote(c.req.param("id"));
  if (!detail) return c.json({ error: "not_found" }, 404);
  return c.json(detail);
});

notesRoutes.post("/:id/versions", async (c) => {
  const body = await c.req.json();
  const actorId =
    (typeof body.actorId === "string" && body.actorId) ||
    c.req.header("x-actor-id") ||
    "usr_clin_001";

  const result = store.createVersion(c.req.param("id"), body, actorId, {
    forceConflict: shouldForceConflict(),
  });
  return c.json(result.body, result.status as 201 | 400 | 404 | 409 | 500);
});

notesRoutes.post("/:id/transitions", async (c) => {
  const body = await c.req.json();
  const result = store.transitionNote(c.req.param("id"), body);
  return c.json(result.body, result.status as 200 | 400 | 404 | 409);
});
