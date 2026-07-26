import {
  NOTE_STATUSES,
  TRANSITIONS,
  can,
  type CreateVersionRequest,
  type CursorPage,
  type NoteAction,
  type NoteDetail,
  type NoteStatus,
  type NoteSummary,
  type TransitionEffect,
  type VersionConflictError,
} from "@soulside/domain";
import { createRng, id, pick } from "./rng";
import type {
  MutationRecord,
  PresenceViewer,
  RealtimeEvent,
  StoredNote,
  StoredReviewEvent,
  StoredUser,
  StoredVersion,
} from "./types";

const DEFAULT_SEED = 42;

const STATUS_WEIGHTS: Array<{ status: NoteStatus; weight: number }> = [
  { status: "READY_FOR_REVIEW", weight: 35 },
  { status: "IN_REVIEW", weight: 15 },
  { status: "APPROVED", weight: 15 },
  { status: "LOCKED", weight: 10 },
  { status: "REJECTED", weight: 10 },
  { status: "AMENDED", weight: 5 },
  { status: "GENERATING", weight: 5 },
  { status: "FAILED", weight: 5 },
];

type ListQuery = {
  cursor?: string | null;
  limit?: number;
  statuses?: NoteStatus[];
  reviewerId?: string | null;
  patientId?: string | null;
  q?: string | null;
  sort?: "updatedAt" | "createdAt" | "status";
  order?: "asc" | "desc";
  /** Inclusive ISO date/time bounds on updatedAt */
  updatedFrom?: string | null;
  updatedTo?: string | null;
};

export type TransitionBody = {
  to: NoteStatus;
  actorId: string;
  reason?: string;
  clientMutationId?: string;
  mfaVerified?: boolean;
  action?: NoteAction;
};

type Listener = (event: RealtimeEvent) => void;

function emptySoap(seedText: string) {
  return {
    sections: {
      S: `Subjective: ${seedText}`,
      O: `Objective: vitals stable for ${seedText}`,
      A: `Assessment: routine follow-up (${seedText})`,
      P: `Plan: continue current regimen for ${seedText}`,
    },
  };
}

function weightedStatus(rng: () => number): NoteStatus {
  const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let roll = rng() * total;
  for (const row of STATUS_WEIGHTS) {
    roll -= row.weight;
    if (roll <= 0) return row.status;
  }
  return "READY_FOR_REVIEW";
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { o?: number };
    return typeof raw.o === "number" && raw.o >= 0 ? raw.o : 0;
  } catch {
    return 0;
  }
}

function findActionForEdge(
  from: NoteStatus,
  to: NoteStatus,
  explicit?: NoteAction,
): NoteAction | null {
  if (explicit) return explicit;
  return (
    TRANSITIONS.find((t) => t.from === from && t.to === to)?.action ?? null
  );
}

export class NoteStore {
  users = new Map<string, StoredUser>();
  notes = new Map<string, StoredNote>();
  versions = new Map<string, StoredVersion>();
  eventsByNote = new Map<string, StoredReviewEvent[]>();
  mutations = new Map<string, MutationRecord>();
  realtimeLog: RealtimeEvent[] = [];
  presence = new Map<string, Map<string, PresenceViewer>>();

  private listeners = new Set<Listener>();
  private eventSeq = 0;
  private seededWith: { count: number; seed: number } | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(
    event: {
      [K in RealtimeEvent["type"]]: Omit<
        Extract<RealtimeEvent, { type: K }>,
        "eventId"
      > & { eventId?: string };
    }[RealtimeEvent["type"]],
  ): RealtimeEvent {
    this.eventSeq += 1;
    const full = {
      ...event,
      eventId: event.eventId ?? `evt_${String(this.eventSeq).padStart(8, "0")}`,
    } as RealtimeEvent;
    this.realtimeLog.push(full);
    if (this.realtimeLog.length > 50_000) {
      this.realtimeLog.splice(0, this.realtimeLog.length - 50_000);
    }
    for (const listener of this.listeners) listener(full);
    return full;
  }

  eventsSince(lastEventId: string | null | undefined): RealtimeEvent[] {
    if (!lastEventId) return [];
    const idx = this.realtimeLog.findIndex((e) => e.eventId === lastEventId);
    if (idx === -1) return this.realtimeLog.slice(-200);
    return this.realtimeLog.slice(idx + 1);
  }

  seed(count: number, seed = DEFAULT_SEED) {
    this.users.clear();
    this.notes.clear();
    this.versions.clear();
    this.eventsByNote.clear();
    this.mutations.clear();
    this.realtimeLog = [];
    this.presence.clear();
    this.eventSeq = 0;
    this.seededWith = { count, seed };

    const rng = createRng(seed);
    const clinicians: StoredUser[] = [
      { id: "usr_clin_001", displayName: "Dr. Avery", role: "CLINICIAN" },
      { id: "usr_clin_002", displayName: "Dr. Blake", role: "CLINICIAN" },
    ];
    const reviewers: StoredUser[] = [
      { id: "usr_rev_001", displayName: "Dr. Chen", role: "REVIEWER" },
      { id: "usr_rev_002", displayName: "Dr. Diaz", role: "REVIEWER" },
      { id: "usr_rev_003", displayName: "Dr. Ellis", role: "REVIEWER" },
    ];
    const extras: StoredUser[] = [
      { id: "usr_adm_001", displayName: "Admin Kim", role: "ADMIN" },
      { id: "usr_aud_001", displayName: "Auditor Lee", role: "READONLY_AUDITOR" },
      { id: "dr_a", displayName: "Dr. A", role: "REVIEWER" },
      { id: "dr_b", displayName: "Dr. B", role: "REVIEWER" },
      { id: "dr_c", displayName: "Dr. C", role: "REVIEWER" },
    ];

    for (const u of [...clinicians, ...reviewers, ...extras]) {
      this.users.set(u.id, u);
    }

    const firstNames = [
      "Riley",
      "Jordan",
      "Casey",
      "Morgan",
      "Quinn",
      "Avery",
      "Reese",
      "Skyler",
    ];
    const lastInitials = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"];
    const baseTime = Date.parse("2025-11-01T12:00:00.000Z");

    for (let i = 0; i < count; i++) {
      const noteId = id("note", i + 1);
      const patientId = id("pat", (i % 500) + 1, 4);
      const patientName = `${pick(rng, firstNames)} ${pick(rng, lastInitials)}.`;
      const clinician = pick(rng, clinicians);
      const status = weightedStatus(rng);
      const createdAt = new Date(baseTime + i * 60_000).toISOString();
      const updatedAt = new Date(
        baseTime + i * 60_000 + Math.floor(rng() * 3_600_000),
      ).toISOString();

      const versionCount = 1 + Math.floor(rng() * 4);
      let parentVersionId: string | null = null;
      let currentVersionId = "";

      for (let v = 1; v <= versionCount; v++) {
        const versionId = id("ver", i * 10 + v);
        const version: StoredVersion = {
          id: versionId,
          noteId,
          revision: v,
          parentVersionId,
          content: emptySoap(`${patientName} r${v}`),
          authoredBy: clinician,
          createdAt: new Date(Date.parse(createdAt) + v * 120_000).toISOString(),
        };
        this.versions.set(versionId, version);
        parentVersionId = versionId;
        currentVersionId = versionId;
      }

      let assignedReviewerId: string | null = null;
      let approvedAt: string | null = null;
      if (status === "IN_REVIEW") {
        assignedReviewerId = pick(rng, reviewers).id;
      }
      if (status === "APPROVED" || status === "LOCKED") {
        approvedAt = new Date(
          Date.parse(updatedAt) - (status === "LOCKED" ? 48 : 2) * 3_600_000,
        ).toISOString();
      }

      const note: StoredNote = {
        id: noteId,
        patient: { id: patientId, displayName: patientName },
        sessionId: id("ses", i + 1),
        status,
        currentVersionId,
        assignedReviewerId,
        approvedAt,
        createdAt,
        updatedAt,
      };
      this.notes.set(noteId, note);

      const events: StoredReviewEvent[] = [
        {
          id: id("evt", i * 10 + 1),
          noteId,
          versionId: currentVersionId,
          fromStatus: null,
          toStatus: "GENERATING",
          actorId: "system",
          actorRole: "ADMIN",
          occurredAt: createdAt,
        },
      ];
      if (status !== "GENERATING" && status !== "FAILED") {
        events.push({
          id: id("evt", i * 10 + 2),
          noteId,
          versionId: currentVersionId,
          fromStatus: "GENERATING",
          toStatus: "READY_FOR_REVIEW",
          actorId: "system",
          actorRole: "ADMIN",
          occurredAt: updatedAt,
        });
      }
      this.eventsByNote.set(noteId, events);
    }

    return { count, seed, users: this.users.size, notes: this.notes.size };
  }

  getUser(userId: string) {
    return this.users.get(userId) ?? null;
  }

  listUsers() {
    return [...this.users.values()];
  }

  toSummary(note: StoredNote): NoteSummary {
    const version = this.versions.get(note.currentVersionId)!;
    const reviewer = note.assignedReviewerId
      ? (this.users.get(note.assignedReviewerId) ?? null)
      : null;
    return {
      id: note.id,
      patient: note.patient,
      status: note.status,
      currentVersion: {
        id: version.id,
        revision: version.revision,
        parentVersionId: version.parentVersionId ?? null,
      },
      assignedReviewer: reviewer,
      approvedAt: note.approvedAt,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }

  toDetail(note: StoredNote): NoteDetail {
    const versions = [...this.versions.values()]
      .filter((v) => v.noteId === note.id)
      .sort((a, b) => a.revision - b.revision);
    const current = this.versions.get(note.currentVersionId)!;
    return {
      ...this.toSummary(note),
      currentVersion: current,
      versions: versions.map((v) => ({
        id: v.id,
        revision: v.revision,
        parentVersionId: v.parentVersionId ?? null,
        authoredBy: v.authoredBy,
        createdAt: v.createdAt,
      })),
      review: { events: this.eventsByNote.get(note.id) ?? [] },
    };
  }

  listNotes(query: ListQuery): CursorPage<NoteSummary> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = decodeCursor(query.cursor);
    const sort = query.sort ?? "updatedAt";
    const order = query.order ?? "desc";
    const q = query.q?.trim().toLowerCase() ?? "";

    let items = [...this.notes.values()];

    if (query.statuses?.length) {
      const set = new Set(query.statuses);
      items = items.filter((n) => set.has(n.status));
    }
    if (query.reviewerId) {
      items = items.filter((n) => n.assignedReviewerId === query.reviewerId);
    }
    if (query.patientId) {
      items = items.filter((n) => n.patient.id === query.patientId);
    }
    if (query.updatedFrom) {
      const from = Date.parse(query.updatedFrom);
      if (!Number.isNaN(from)) {
        items = items.filter((n) => Date.parse(n.updatedAt) >= from);
      }
    }
    if (query.updatedTo) {
      const to = Date.parse(query.updatedTo);
      if (!Number.isNaN(to)) {
        items = items.filter((n) => Date.parse(n.updatedAt) <= to);
      }
    }
    if (q) {
      items = items.filter((n) => {
        if (n.patient.displayName.toLowerCase().includes(q)) return true;
        if (n.id.toLowerCase().includes(q)) return true;
        const version = this.versions.get(n.currentVersionId);
        if (!version) return false;
        const blob = Object.values(version.content.sections)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }

    items.sort((a, b) => {
      const dir = order === "asc" ? 1 : -1;
      let primary = 0;
      if (sort === "status") primary = a.status.localeCompare(b.status);
      else if (sort === "createdAt") {
        primary = a.createdAt.localeCompare(b.createdAt);
      } else {
        primary = a.updatedAt.localeCompare(b.updatedAt);
      }
      if (primary !== 0) return primary * dir;
      return a.id.localeCompare(b.id) * dir;
    });

    const total = items.length;
    const page = items.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const hasMore = nextOffset < total;

    return {
      cursor: {
        next: hasMore ? encodeCursor(nextOffset) : null,
        hasMore,
      },
      items: page.map((n) => this.toSummary(n)),
      meta: {
        total,
        returned: page.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  getNote(noteId: string) {
    const note = this.notes.get(noteId);
    return note ? this.toDetail(note) : null;
  }

  private rememberMutation(
    clientMutationId: string | undefined,
    status: number,
    body: unknown,
  ) {
    if (!clientMutationId) return;
    this.mutations.set(clientMutationId, { clientMutationId, status, body });
  }

  private replayMutation(clientMutationId: string | undefined) {
    if (!clientMutationId) return null;
    return this.mutations.get(clientMutationId) ?? null;
  }

  private applyEffects(note: StoredNote, effects: TransitionEffect[]) {
    for (const effect of effects) {
      switch (effect.type) {
        case "assign_reviewer":
          note.assignedReviewerId = effect.reviewerId;
          break;
        case "release_reviewer":
          note.assignedReviewerId = null;
          break;
        case "record_approved_at":
          note.approvedAt = effect.at;
          break;
        case "clear_approved_at":
          note.approvedAt = null;
          break;
        case "require_new_version":
          break;
      }
    }
  }

  createVersion(
    noteId: string,
    body: CreateVersionRequest,
    actorId: string,
    opts?: { forceConflict?: boolean },
  ): { status: number; body: unknown } {
    const replay = this.replayMutation(body.clientMutationId);
    if (replay) return { status: replay.status, body: replay.body };

    const note = this.notes.get(noteId);
    if (!note) return { status: 404, body: { error: "not_found" } };

    const actor = this.users.get(actorId);
    if (!actor) return { status: 400, body: { error: "unknown_actor" } };

    if (!body.clientMutationId) {
      return { status: 400, body: { error: "clientMutationId_required" } };
    }
    if (!body.baseVersionId || !body.content?.sections) {
      return { status: 400, body: { error: "invalid_body" } };
    }

    const head = this.versions.get(note.currentVersionId);
    if (!head) return { status: 500, body: { error: "missing_head" } };

    if (opts?.forceConflict || body.baseVersionId !== head.id) {
      const commonAncestor = this.findCommonAncestor(body.baseVersionId, head.id);
      const conflict: VersionConflictError = {
        error: "version_conflict",
        current: {
          id: head.id,
          revision: head.revision,
          parentVersionId: head.parentVersionId ?? null,
          authoredBy: head.authoredBy,
        },
        commonAncestor: commonAncestor ?? {
          id: head.parentVersionId ?? head.id,
          revision: Math.max(1, head.revision - 1),
          parentVersionId: null,
        },
      };
      return { status: 409, body: conflict };
    }

    const versionId = `ver_${noteId}_${head.revision + 1}_${Date.now().toString(36)}`;
    const version: StoredVersion = {
      id: versionId,
      noteId,
      revision: head.revision + 1,
      parentVersionId: head.id,
      content: body.content,
      authoredBy: actor,
      createdAt: new Date().toISOString(),
    };
    this.versions.set(versionId, version);
    note.currentVersionId = versionId;
    note.updatedAt = version.createdAt;

    const response = {
      version: {
        id: version.id,
        revision: version.revision,
        parentVersionId: head.id,
      },
    };
    this.rememberMutation(body.clientMutationId, 201, response);
    this.emit({
      type: "note.version_added",
      noteId,
      version: {
        id: version.id,
        revision: version.revision,
        parentVersionId: head.id,
      },
      at: version.createdAt,
    });
    return { status: 201, body: response };
  }

  private findCommonAncestor(aId: string, bId: string) {
    const ancestors = new Set<string>();
    let cur: StoredVersion | undefined = this.versions.get(aId);
    while (cur) {
      ancestors.add(cur.id);
      cur = cur.parentVersionId
        ? this.versions.get(cur.parentVersionId)
        : undefined;
    }
    cur = this.versions.get(bId);
    while (cur) {
      if (ancestors.has(cur.id)) {
        return {
          id: cur.id,
          revision: cur.revision,
          parentVersionId: cur.parentVersionId ?? null,
        };
      }
      cur = cur.parentVersionId
        ? this.versions.get(cur.parentVersionId)
        : undefined;
    }
    return null;
  }

  transitionNote(noteId: string, body: TransitionBody): { status: number; body: unknown } {
    const replay = this.replayMutation(body.clientMutationId);
    if (replay) return { status: replay.status, body: replay.body };

    const note = this.notes.get(noteId);
    if (!note) return { status: 404, body: { error: "not_found" } };

    const actor = this.users.get(body.actorId);
    if (!actor) return { status: 400, body: { error: "unknown_actor" } };

    const action = findActionForEdge(note.status, body.to, body.action);
    if (!action) {
      return {
        status: 409,
        body: {
          error: "invalid_transition",
          reason: `No action maps ${note.status} → ${body.to}`,
        },
      };
    }

    const now = new Date().toISOString();
    const result = can(action, {
      status: note.status,
      assignedReviewerId: note.assignedReviewerId,
      approvedAt: note.approvedAt,
      now,
      actor: { id: actor.id, role: actor.role },
      reason: body.reason,
      mfaVerified: body.mfaVerified ?? true,
      source: "user",
    });

    if (!result.ok) {
      return {
        status: 409,
        body: { error: "transition_rejected", reason: result.reason },
      };
    }

    const fromStatus = note.status;
    note.status = result.to;
    this.applyEffects(note, result.effects);
    note.updatedAt = now;

    if (result.effects.some((e) => e.type === "require_new_version")) {
      const head = this.versions.get(note.currentVersionId)!;
      const branchedId = `ver_${noteId}_branch_${Date.now().toString(36)}`;
      const branched: StoredVersion = {
        id: branchedId,
        noteId,
        revision: head.revision + 1,
        parentVersionId: head.id,
        content: structuredClone(head.content),
        authoredBy: actor,
        createdAt: now,
      };
      this.versions.set(branchedId, branched);
      note.currentVersionId = branchedId;
      this.emit({
        type: "note.version_added",
        noteId,
        version: {
          id: branched.id,
          revision: branched.revision,
          parentVersionId: head.id,
        },
        at: now,
      });
    }

    const reviewEvent: StoredReviewEvent = {
      id: `evt_${noteId}_${Date.now().toString(36)}`,
      noteId,
      versionId: note.currentVersionId,
      fromStatus,
      toStatus: result.to,
      actorId: actor.id,
      actorRole: actor.role,
      reason: body.reason,
      occurredAt: now,
    };
    const list = this.eventsByNote.get(noteId) ?? [];
    list.push(reviewEvent);
    this.eventsByNote.set(noteId, list);

    const response = {
      note: this.toSummary(note),
      event: reviewEvent,
    };
    this.rememberMutation(body.clientMutationId, 200, response);

    this.emit({
      type: "note.status_changed",
      noteId,
      fromStatus,
      toStatus: result.to,
      actor,
      at: now,
      eventId: reviewEvent.id,
    });

    return { status: 200, body: response };
  }

  setPresence(
    noteId: string,
    socketId: string,
    viewer: Omit<PresenceViewer, "socketId"> | null,
  ) {
    if (!this.notes.has(noteId)) return;
    let map = this.presence.get(noteId);
    if (!map) {
      map = new Map();
      this.presence.set(noteId, map);
    }
    if (!viewer) map.delete(socketId);
    else map.set(socketId, { ...viewer, socketId });

    const viewers = [...map.values()].map((v) => ({
      id: v.userId,
      role: v.role,
      displayName: v.displayName,
    }));
    this.emit({
      type: "note.presence",
      noteId,
      viewers,
      at: new Date().toISOString(),
    });
  }

  clearSocketPresence(socketId: string) {
    for (const [noteId, map] of this.presence) {
      if (!map.has(socketId)) continue;
      map.delete(socketId);
      const viewers = [...map.values()].map((v) => ({
        id: v.userId,
        role: v.role,
        displayName: v.displayName,
      }));
      this.emit({
        type: "note.presence",
        noteId,
        viewers,
        at: new Date().toISOString(),
      });
    }
  }

  /** Pick a READY_FOR_REVIEW note for simulation helpers. */
  pickReadyNote() {
    return (
      [...this.notes.values()].find((n) => n.status === "READY_FOR_REVIEW") ??
      null
    );
  }

  info() {
    return {
      seededWith: this.seededWith,
      notes: this.notes.size,
      users: this.users.size,
      realtimeEvents: this.realtimeLog.length,
      statuses: Object.fromEntries(
        NOTE_STATUSES.map((s) => [
          s,
          [...this.notes.values()].filter((n) => n.status === s).length,
        ]),
      ),
    };
  }
}

export const store = new NoteStore();
