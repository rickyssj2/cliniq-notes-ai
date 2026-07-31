/**
 * simulate_workflow.ts — Happy-path + light concurrency + extra scenarios
 *
 * Usage:
 *   pnpm simulate                         # API must be running (default :3001)
 *   pnpm simulate http://localhost:3001
 *   pnpm simulate http://localhost:3001 --scenarios-only
 *
 * Assignment shape: seed → 3 reviewers each claim READY notes, edit, approve/reject.
 * Extra scenarios (assignment “build your own”): overlap conflict, reject+admin+resubmit,
 * realtime-before-ack ordering, burst 500 detail fetches (subscription/load smoke).
 */
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const args = process.argv.slice(2);
const BASE = (
  args.find((a) => a.startsWith("http")) ??
  process.env.API_URL ??
  "http://localhost:3001"
).replace(/\/$/, "");

const SCENARIOS_ONLY = args.includes("--scenarios-only");
const SKIP_SCENARIOS = args.includes("--skip-scenarios");

type Json = Record<string, unknown>;

type NoteSummary = {
  id: string;
  status: string;
  currentVersion: { id: string; revision: number };
};

type NoteDetail = {
  id: string;
  status: string;
  currentVersion: {
    id: string;
    revision: number;
    content: { sections: Record<string, string> };
  };
  assignedReviewer: { id: string } | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(n: number) {
  return Math.floor(Math.random() * n);
}

function isOk(status: number) {
  return status >= 200 && status < 300;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as T;
  return { status: res.status, data };
}

const tokenCache = new Map<string, string>();

async function tokenFor(actorId: string): Promise<string> {
  const cached = tokenCache.get(actorId);
  if (cached) return cached;
  const { status, data } = await request<{
    accessToken?: string;
    error?: string;
  }>("POST", "/api/dev/token", { actorId });
  if (!isOk(status) || !data.accessToken) {
    throw new Error(
      `token mint failed for ${actorId}: ${status} ${JSON.stringify(data)}`,
    );
  }
  tokenCache.set(actorId, data.accessToken);
  return data.accessToken;
}

async function authHeaders(actorId: string): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await tokenFor(actorId)}` };
}

/** Retry transient chaos 500s (assignment injects flakiness). */
async function requestRetry<T>(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
  attempts = 6,
): Promise<{ status: number; data: T }> {
  let last: { status: number; data: T } | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await request<T>(method, path, body, headers);
    if (last.status !== 500) return last;
    await sleep(150 + i * 100);
  }
  return last!;
}

function mutateContent(sections: Record<string, string>) {
  const keys = ["S", "O", "A", "P"] as const;
  const key = keys[rand(keys.length)]!;
  return {
    sections: {
      ...sections,
      [key]: `${sections[key] ?? ""}\n[sim edit ${new Date().toISOString()}]`,
    },
  };
}

async function seed(count = 5000) {
  const { status, data } = await requestRetry<Json>("POST", "/api/dev/seed", {
    count,
    seed: 42,
  });
  if (!isOk(status)) throw new Error(`seed failed ${status} ${JSON.stringify(data)}`);
  console.log(`[seed] ok count=${count}`);
}

async function configureChaos() {
  // Match assignment intent: latency + occasional 500/conflict.
  await request("POST", "/api/dev/chaos", {
    enabled: true,
    minLatencyMs: 50,
    maxLatencyMs: 400,
    failureRate: 0.03,
    conflictRate: 0.02,
  });
}

async function pickReadyNote(): Promise<NoteSummary | null> {
  const { status, data } = await requestRetry<NoteSummary | { error: string }>(
    "GET",
    "/api/dev/ready-note",
  );
  if (status === 404) return null;
  if (!isOk(status)) throw new Error(`ready-note ${status}`);
  return data as NoteSummary;
}

async function getDetail(noteId: string): Promise<NoteDetail> {
  const { status, data } = await requestRetry<NoteDetail>(
    "GET",
    `/api/notes/${noteId}`,
    undefined,
    await authHeaders("dr_a"),
  );
  if (!isOk(status)) throw new Error(`detail ${noteId} → ${status}`);
  return data;
}

async function transition(
  noteId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; data: Json }> {
  const actorId = String(body.actorId ?? "dr_a");
  return requestRetry(
    "POST",
    `/api/notes/${noteId}/transitions`,
    body,
    await authHeaders(actorId),
  );
}

async function saveVersion(
  noteId: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ status: number; data: Json }> {
  const actorId = String(body.actorId ?? "dr_a");
  return requestRetry("POST", `/api/notes/${noteId}/versions`, body, {
    ...(await authHeaders(actorId)),
    ...headers,
  });
}

/** Claim a READY note for this reviewer (handles concurrent claim races). */
async function claimReadyNote(reviewerId: string): Promise<NoteDetail | null> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const ready = await pickReadyNote();
    if (!ready) return null;
    const res = await transition(ready.id, {
      to: "IN_REVIEW",
      actorId: reviewerId,
      clientMutationId: `sim_start_${reviewerId}_${randomUUID()}`,
    });
    if (isOk(res.status)) return getDetail(ready.id);
    // Lost the race or chaos — try another.
    await sleep(50);
  }
  return null;
}

async function reviewerLoop(reviewerId: string, iterations = 20) {
  let done = 0;
  let conflicts = 0;
  let rejects = 0;
  let approves = 0;

  for (let i = 0; i < iterations; i++) {
    const note = await claimReadyNote(reviewerId);
    if (!note) {
      console.warn(`[${reviewerId}] no READY notes left at i=${i}`);
      break;
    }

    const edits = 1 + rand(3);
    for (let e = 0; e < edits; e++) {
      const head = await getDetail(note.id);
      const res = await saveVersion(note.id, {
        baseVersionId: head.currentVersion.id,
        content: mutateContent(head.currentVersion.content.sections),
        clientMutationId: `sim_save_${reviewerId}_${randomUUID()}`,
        actorId: reviewerId,
      });
      if (res.status === 409) {
        conflicts += 1;
        // Resolve like the UI: retarget to server head and save once (retry if chaos forces another 409).
        let conflict = res.data as {
          current?: { id: string; content: { sections: Record<string, string> } };
        };
        for (let r = 0; r < 5; r++) {
          if (!conflict.current) break;
          const resolved = await saveVersion(note.id, {
            baseVersionId: conflict.current.id,
            content: mutateContent(conflict.current.content.sections),
            clientMutationId: `sim_resolve_${reviewerId}_${randomUUID()}`,
            actorId: reviewerId,
          });
          if (isOk(resolved.status)) break;
          if (resolved.status === 409) {
            conflict = resolved.data as typeof conflict;
            continue;
          }
          throw new Error(
            `[${reviewerId}] resolve failed ${resolved.status} ${JSON.stringify(resolved.data)}`,
          );
        }
      } else if (!isOk(res.status)) {
        throw new Error(
          `[${reviewerId}] save failed ${res.status} ${JSON.stringify(res.data)}`,
        );
      }
    }

    const outcome = Math.random() < 0.7 ? "APPROVED" : "REJECTED";
    const fin = await transition(note.id, {
      to: outcome,
      actorId: reviewerId,
      mfaVerified: true,
      reason: outcome === "REJECTED" ? "missing plan" : undefined,
      clientMutationId: `sim_fin_${reviewerId}_${randomUUID()}`,
    });
    if (!isOk(fin.status)) {
      throw new Error(
        `[${reviewerId}] finish ${outcome} failed ${fin.status} ${JSON.stringify(fin.data)}`,
      );
    }
    if (outcome === "APPROVED") approves += 1;
    else rejects += 1;
    done += 1;
  }

  console.log(
    `[${reviewerId}] done=${done} approves=${approves} rejects=${rejects} conflicts_resolved=${conflicts}`,
  );
}

// ── Extra scenarios ─────────────────────────────────────────────────────────

async function scenarioOverlappingEditors() {
  console.log("\n[scenario] overlapping editors → 409 without data loss");
  const note = await claimReadyNote("dr_a");
  if (!note) throw new Error("overlap: no note");

  const head = await getDetail(note.id);
  const base = head.currentVersion.id;

  const a = await saveVersion(note.id, {
    baseVersionId: base,
    content: {
      sections: {
        ...head.currentVersion.content.sections,
        S: `${head.currentVersion.content.sections.S}\n[editor A]`,
      },
    },
    clientMutationId: `overlap_a_${randomUUID()}`,
    actorId: "dr_a",
  });
  if (!isOk(a.status)) throw new Error(`overlap A save ${a.status}`);

  const b = await saveVersion(note.id, {
    baseVersionId: base, // stale on purpose
    content: {
      sections: {
        ...head.currentVersion.content.sections,
        S: `${head.currentVersion.content.sections.S}\n[editor B]`,
      },
    },
    clientMutationId: `overlap_b_${randomUUID()}`,
    actorId: "dr_a",
  });
  if (b.status !== 409) {
    throw new Error(`overlap expected 409, got ${b.status}`);
  }
  const body = b.data as {
    error?: string;
    current?: { id: string };
    commonAncestor?: { id: string };
  };
  if (body.error !== "version_conflict" || !body.current || !body.commonAncestor) {
    throw new Error(`overlap bad payload ${JSON.stringify(body)}`);
  }

  // B keeps work: merge onto current head
  const resolve = await saveVersion(note.id, {
    baseVersionId: body.current.id,
    content: {
      sections: {
        ...head.currentVersion.content.sections,
        S: `${head.currentVersion.content.sections.S}\n[editor A]\n[editor B merged]`,
      },
    },
    clientMutationId: `overlap_merge_${randomUUID()}`,
    actorId: "dr_a",
  });
  if (!isOk(resolve.status)) throw new Error(`overlap merge ${resolve.status}`);
  console.log("[scenario] overlapping editors OK");
}

async function scenarioRejectResubmitAfterAdminEdit() {
  console.log("\n[scenario] REJECTED → admin supersedes → clinician resubmit");
  const note = await claimReadyNote("dr_b");
  if (!note) throw new Error("resubmit: no note");

  const rej = await transition(note.id, {
    to: "REJECTED",
    actorId: "dr_b",
    reason: "incomplete assessment",
    clientMutationId: `rej_${randomUUID()}`,
  });
  if (!isOk(rej.status)) throw new Error(`reject ${rej.status}`);

  const beforeAdmin = await getDetail(note.id);
  const staleBase = beforeAdmin.currentVersion.id;

  const adminSave = await saveVersion(note.id, {
    baseVersionId: staleBase,
    content: {
      sections: {
        ...beforeAdmin.currentVersion.content.sections,
        A: `${beforeAdmin.currentVersion.content.sections.A}\n[admin edit]`,
      },
    },
    clientMutationId: `admin_edit_${randomUUID()}`,
    actorId: "usr_adm_001",
  });
  if (!isOk(adminSave.status)) throw new Error(`admin save ${adminSave.status}`);

  // Stale clinician save while still REJECTED (before resubmit) must 409 — not 403.
  const stale = await saveVersion(note.id, {
    baseVersionId: staleBase,
    content: beforeAdmin.currentVersion.content,
    clientMutationId: `stale_after_admin_${randomUUID()}`,
    actorId: "usr_clin_001",
  });
  if (stale.status !== 409) {
    throw new Error(
      `expected 409 after admin supersede (while REJECTED), got ${stale.status}`,
    );
  }

  const resub = await transition(note.id, {
    to: "READY_FOR_REVIEW",
    actorId: "usr_clin_001",
    clientMutationId: `resub_${randomUUID()}`,
  });
  if (!isOk(resub.status)) {
    throw new Error(`resubmit ${resub.status} ${JSON.stringify(resub.data)}`);
  }

  console.log("[scenario] reject/resubmit/admin OK");
}

async function scenarioRealtimeBeforeAck() {
  console.log("\n[scenario] status_changed may arrive before HTTP ack");
  const ready = await pickReadyNote();
  if (!ready) throw new Error("rt: no ready note");

  const wsUrl = BASE.replace(/^http/, "ws") + "/ws";
  const events: string[] = [];
  let httpDoneAt = 0;
  let wsStatusAt = 0;

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("rt: timeout waiting for WS event"));
    }, 15_000);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "subscribe",
          noteIds: [ready.id],
        }),
      );
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw)) as {
        type: string;
        noteId?: string;
        toStatus?: string;
      };
      events.push(msg.type);
      if (
        msg.type === "note.status_changed" &&
        msg.noteId === ready.id &&
        msg.toStatus === "IN_REVIEW"
      ) {
        wsStatusAt = Date.now();
        clearTimeout(timer);
        ws.close();
        resolve();
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // Fire transition shortly after subscribe.
    void (async () => {
      await sleep(200);
      const res = await transition(ready.id, {
        to: "IN_REVIEW",
        actorId: "dr_c",
        clientMutationId: `rt_start_${randomUUID()}`,
      });
      httpDoneAt = Date.now();
      if (!isOk(res.status)) {
        clearTimeout(timer);
        ws.close();
        reject(new Error(`rt transition ${res.status}`));
      }
    })();
  });

  const order =
    httpDoneAt === 0
      ? "ws_before_http_ack"
      : wsStatusAt <= httpDoneAt
        ? "ws_before_or_with_http"
        : "http_before_ws";
  console.log(
    `[scenario] realtime-before-ack OK (order=${order}; client must reconcile either order)`,
  );
}

async function scenarioBurstDetailFetches() {
  console.log("\n[scenario] burst 500 detail fetches (load / no crash)");
  const auth = await authHeaders("dr_a");
  const { status, data } = await requestRetry<{
    items: NoteSummary[];
  }>(
    "GET",
    "/api/notes?limit=100&status=READY_FOR_REVIEW,IN_REVIEW,APPROVED",
    undefined,
    auth,
  );
  if (!isOk(status)) throw new Error(`list ${status}`);

  const ids: string[] = [];
  const pageData = data as {
    items: NoteSummary[];
    cursor?: { next?: string | null; hasMore?: boolean };
  };
  let cursor: string | null =
    pageData.cursor?.hasMore && pageData.cursor.next
      ? pageData.cursor.next
      : null;
  ids.push(...pageData.items.map((n) => n.id));

  while (ids.length < 500 && cursor) {
    const page = await requestRetry<{
      items: NoteSummary[];
      cursor: { next: string | null; hasMore: boolean };
    }>(
      "GET",
      `/api/notes?limit=100&cursor=${encodeURIComponent(cursor)}`,
      undefined,
      auth,
    );
    if (!isOk(page.status)) break;
    ids.push(...page.data.items.map((n) => n.id));
    cursor = page.data.cursor.hasMore ? page.data.cursor.next : null;
  }

  const target = ids.slice(0, 500);
  if (target.length < 50) {
    console.warn(`[scenario] burst only got ${target.length} ids — continuing`);
  }

  let ok = 0;
  for (const id of target) {
    const res = await requestRetry("GET", `/api/notes/${id}`, undefined, auth);
    if (isOk(res.status)) ok += 1;
  }
  console.log(`[scenario] burst OK fetched=${ok}/${target.length}`);
}

async function runExtraScenarios() {
  // Stabilize scenario assertions (still exercise conflict via stale base / force).
  await request("POST", "/api/dev/chaos", { enabled: false, failNext: {} });
  await scenarioOverlappingEditors();
  await scenarioRejectResubmitAfterAdminEdit();
  await scenarioRealtimeBeforeAck();
  await scenarioBurstDetailFetches();
}

async function main() {
  console.log(`=== Soulside simulate_workflow @ ${BASE} ===`);
  await requestRetry("GET", "/api/health");

  if (!SCENARIOS_ONLY) {
    await seed(5000);
    await configureChaos();
    await Promise.all([
      reviewerLoop("dr_a", 20),
      reviewerLoop("dr_b", 20),
      reviewerLoop("dr_c", 20),
    ]);
    console.log("=== Happy-path simulation complete ===");
  }

  if (!SKIP_SCENARIOS) {
    if (SCENARIOS_ONLY) await seed(2000);
    await runExtraScenarios();
    console.log("=== Extra scenarios complete ===");
  }

  console.log(
    "Verify: no unhandled conflicts (resolved or asserted), writes ack'd, RT reconcile either order",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
