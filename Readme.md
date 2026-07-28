# Soulside AI — Clinical Notes Workflow

Frontend take-home: AI-assisted clinical notes review SPA.

## Quick start

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:5173
- **API Lab (Phase 2 UI):** http://localhost:5173/lab
- API health: http://localhost:3001/api/health (also proxied at `/api/health`)

### Try in UI — Phase 2

1. Run `pnpm dev`, open http://localhost:5173/lab
2. Click **Seed** (e.g. 500), then **List notes**
3. **Connect WS**, then **Pick READY note** (or click a row)
4. **Start review** → **Save version** → **Force 409 conflict** → **Approve** or **Reject**
5. Watch the event log for HTTP results and live `note.*` WebSocket messages
6. Toggle **Chaos** ON to feel latency / occasional 500s

### Try in UI — Phase 3

1. Open http://localhost:5173 — use **Act as** in the header to switch roles
2. As **Auditor Lee**: Notes works. Admin / API Lab show **Permission denied** (not empty). Nav items are struck through with hover reasons. On Notes, bulk actions are disabled with a reason tooltip
3. As **Dr. A (REVIEWER)**: Notes + Lab open; Admin stays denied; bulk assign enables
4. As **Admin Kim**: Admin + Lab all open
5. Reload the page — the selected actor persists (Zustand + localStorage)

### Try in UI — Phase 4

1. Ensure API is running (auto-seeds 5000 notes). Open http://localhost:5173/notes
2. Scroll the list — more pages load; footer shows loaded / matching counts
3. Toggle status chips, search (debounced), reviewer, dates — URL updates; copy/paste the URL to deep-link
4. Click column headers (Status / Updated / Created) to sort
5. Select rows across scroll; use **Start review** / **Request regeneration** on the sticky bulk bar (as REVIEWER/ADMIN). Watch optimistic status chips update
6. Clear filters vs search with no matches — empty workspace vs **no results** messaging differ
7. Click a patient name → detail stub (Phase 5)

### Try in UI — Phase 5

1. From `/notes`, open a `READY_FOR_REVIEW` note as **Dr. A**
2. Action bar shows **Start review** (from `getAvailableActions`). Start it — status becomes `IN_REVIEW`
3. Edit SOAP sections — each dirty section gets a **Dirty** badge; **Save draft** enables
4. Save — revision bumps; dirty badges clear
5. Try **Approve** (confirm = mock MFA) or **Reject** (reason prompt). Hover disabled actions when signed in as the wrong role
6. Open a `LOCKED` note — editor read-only + lock message (no amend path)
7. As **Auditor Lee**, open any note — SOAP read-only (no `mutate_workflow`)

### Try in UI — Phase 6

1. Open an `IN_REVIEW` note as **Dr. A**. Edit SOAP — watch status flip to dirty, then **Saving…** (~800ms), then **Saved** without clicking Save
2. Type quickly — saves coalesce (one in-flight POST; at most one follow-up)
3. Arm **Force conflict on next save**, edit, wait for autosave (or Save now) → three-way merge modal (ancestor / yours / server with word diffs)
4. Pick sections → **Resolve & save** — revision advances; no duplicate versions if you retry the same `clientMutationId`
5. **Fail next save (500)** then edit — optimistic paint rolls back; error shows; Retry reuses the same mutation id
6. List filters survive detail ↔ back (search params preserved on Links)

### Try in UI — Phase 7

1. Open `/notes` — header badge should read **Live**
2. Open the same `IN_REVIEW` note in two browser tabs (optionally different actors via **Act as**)
3. In tab A, **Start review** / **Approve** / edit+save — tab B list status chip and detail update without refresh; presence avatars appear while both have the note open
4. In tab A, edit SOAP and leave dirty; in tab B save a different edit — tab A opens the same three-way conflict merge UI
5. Kill the API briefly or throttle network — badge shows **Reconnecting…**, then **Live**; missed events replay via `lastEventId`

### Try in UI — Phase 8

1. Browse `/notes` while online (load a page of rows), open an `IN_REVIEW` note
2. DevTools → Network → **Offline** — header badge flips to **Offline**, amber banner appears
3. Edit SOAP — autosave enqueues to IndexedDB; button may show **Queued**
4. ← Notes — cached list still shows; opening an uncached note shows **You’re offline** (not “not found”)
5. Reload while still offline — queued content restores from Dexie; pending count survives
6. Go online — banner **Back online · syncing…**, queue drains, revision bumps

### Try in UI — Phase 9

1. Open a note with multiple revisions (save a few SOAP edits while `IN_REVIEW`)
2. In **Version history**, click two revisions — SOAP word-diff appears (older → newer)
3. Run a transition (Start review / Approve) — **Review timeline** shows the status edge
4. DevTools Offline → queue a transition or save — timeline shows an amber **Optimistic** row until sync

### Try in UI — Phase 10

1. Bottom-right **Telemetry** (dev only) — open panel; counts for buffered / flushed / parked
2. **Emit sample** — Network → `POST /api/telemetry/batch`; body has `content`/`S` as `[redacted]`, never free text
3. Edit SOAP / run a transition — events batch (~4s or 20 events); **Flush now** to force send
4. **Fail ×3 + flush** — after 3 injected 500s the batch parks in IndexedDB (`Parked`); **Flush now** again replays
5. Hard-refresh mid-buffer (or switch tabs) — `sendBeacon` / keepalive flush; parked rows survive reload

## Workspace

| Package | Role |
|---|---|
| `apps/web` | Vite + React SPA (Feature-Sliced Design) |
| `apps/api` | Hono mock REST + WebSocket + deterministic seed |
| `packages/domain` | Shared types + pure `noteMachine` |

### Web FSD layout

```
apps/web/src/
  app/         # providers, styles, shell
  pages/       # routable screens
  widgets/     # composite UI blocks
  features/    # user-facing capabilities
  entities/    # business entities
  shared/      # ui, api, db (Dexie), config, lib
```

Import rule: layers only depend downward (`app` → `pages` → `widgets` → `features` → `entities` → `shared`).

## Design decisions

Filled in as phases land. Required by the assignment:

### State Topology — Where state lives

_In progress. So far:_
- **Pure domain (`packages/domain`)** — lifecycle invariants via `noteMachine` (no React, no I/O)
- **Zustand** — session/actor; note selection; SOAP editor drafts; presence; conflict modal; connectivity
- **TanStack Query** — notes list/detail; optimistic patches; live WS reconciliation; 35m `gcTime` for offline reads
- **Dexie** — mutation write queue (Phase 8); telemetry park (Phase 10)
- **URL** — list filters/sort/search (preserved across detail Links)
- **WebSocket** — viewport + detail subscriptions; reconnect cursor replay
- **Telemetry batcher** — in-memory buffer → `/api/telemetry/batch`; Dexie park after retries

### State Machine — How the note lifecycle is modelled

Implemented as a pure module in [`packages/domain/src/note-machine`](packages/domain/src/note-machine):

- **Transition table** (`TRANSITIONS`) is the single source of truth for legal edges and guards
- **`can` / `transition`** validate user intent before any API call
- **`applyServerStatusChange`** runs real-time / authoritative status pushes through the same table (`source: "server"` trusts MFA already happened)
- **`getAvailableActions`** drives the action bar — disabled buttons carry human-readable `reason` strings (e.g. "You are not the assigned reviewer")
- Invalid transitions are rejected in one place; UI must not hard-code status `if` checks

Happy path: `GENERATING → READY_FOR_REVIEW → IN_REVIEW → APPROVED → LOCKED` (plus `FAILED`, `REJECTED`, `AMENDED` branches).

```bash
pnpm --filter @soulside/domain test
```

### Optimistic Updates — Apply and roll back

_Phase 4 (list):_ bulk transitions patch the TanStack Query infinite-list cache optimistically, then reconcile with the server response or roll back on failure.

_Phase 6 (detail):_ coalesced autosave paints draft SOAP into the detail (+ list `updatedAt`) before the POST resolves; on `500`/`409` the snapshot is restored. Conflicts open a merge modal instead of silently dropping edits.

_Phase 9 (timeline):_ pending Dexie queue items appear as amber optimistic rows on the review timeline until drain/ack refreshes `review.events`.

### Concurrency — Version conflicts without data loss

`POST /api/notes/:id/versions` requires `baseVersionId`. Mismatch (or `X-Force-Conflict: 1` / chaos / fail-next) returns `409 version_conflict` with **content** for `current` + `commonAncestor`. Detail UI: three-way merge (yours / server / ancestor), word-level `diff`, resolve retargets `baseVersionId` to server head and saves once. Mutations stay idempotent via `clientMutationId` (retry after 5xx reuses the id).

### Offline — Write queue survives reloads

Dexie `mutationQueue` holds `create_version` / `transition` intents. Offline autosave **coalesces** pending version rows per note, then marks the draft clean locally. On reload, pending SOAP is rehydrated from the queue. Reconnect drains `orderBy(createdAt)`; `409` opens the same merge UI. Connectivity banner + header badge both follow `navigator.onLine`; WS disconnects while offline. Uncached detail/list reads show an offline message (not “not found”). Query `gcTime` is 35m so cached reads stay available offline.

### Real-Time — Reconcile channel with optimistic state

App-wide WebSocket (`shared/realtime`): viewport note ids from the virtualizer + open detail; `presence.join` on detail. Events dedupe by `eventId`. `note.status_changed` / `note.version_added` patch TanStack Query (status chips live); dirty draft + foreign `version_added` opens the Phase 6 merge UI. Reconnect uses exponential backoff + jitter and resubscribes with `lastEventId` for replay. Header **Live** badge + presence avatars.

### Telemetry — Batch, retry, unload, PII redaction

Only public API: `track(name, props, { important? })` in `shared/telemetry`. Client batches by size (20), timer (4s / 800ms if important), and `visibilitychange` / `pagehide`. After **3** failed sends the batch is **parked in Dexie** (`telemetryPark`) and replayed on later flushes. Unload uses `navigator.sendBeacon` then `fetch({ keepalive: true })`. `redactProps` strips SOAP/`content`/long strings before enqueue; API rejects those keys as defense in depth. Dev **Telemetry** panel shows counts only (no props). Instrumented: page views, autosave, transitions, offline drain, conflicts.

### Scale — List/detail/history at 100k+ notes

_Phase 4:_ TanStack Virtual + infinite cursor query on `/notes`. Filters/sort/search URL-persisted. Seed up to 100k via `POST /api/dev/seed`. Detail version content loads on demand via `GET /notes/:id/versions/:versionId` (Phase 9).

### Testing — Unit, integration, e2e posture

- **Unit (done):** 32 Vitest cases for every legal/illegal edge, guard failure reasons, grace window, server-driven path, READONLY_AUDITOR, and `getAvailableActions`
- **API smoke (Phase 2):** seed, list, transition, idempotent version save, 409 conflict, WebSocket subscribe/presence
- **Integration / e2e:** deferred to later phases

### Accessibility — Keyboard, SR, WCAG 2.2 AA

_Pending full pass by Phase 11._ Route-level `ErrorBoundary` (header stays up; Try again / Back to notes) pulled forward so render failures don’t blank the SPA.

## Dummy API (Phase 2)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Store stats |
| POST | `/api/dev/seed` | `{ count, seed? }` deterministic |
| GET | `/api/dev/users` | Seeded actors (`dr_a`…, clinicians, …) |
| GET | `/api/dev/ready-note` | First `READY_FOR_REVIEW` |
| GET | `/api/notes` | Cursor + `status`, `reviewerId`, `patientId`, `q`, `sort`, `order`, `limit` |
| GET | `/api/notes/:id` | Detail + versions meta + review events |
| GET | `/api/notes/:id/versions/:versionId` | Full version content (for history diffs) |
| POST | `/api/notes/:id/versions` | `baseVersionId`, `content`, `clientMutationId` |
| POST | `/api/notes/:id/transitions` | `{ to, actorId, reason?, mfaVerified?, clientMutationId? }` — validated by `noteMachine` |
| POST | `/api/telemetry/batch` | Batched client events (`batchId` + redacted props); rejects PII-ish keys |
| GET | `/api/telemetry/recent` | Last ingested batch summaries (names/counts only) |
| WS | `/ws` | `subscribe` / `replay` / `presence.join` |

Chaos (default on): 100–800ms latency, ~5% `500`, ~2% forced version conflicts. Disable with `CHAOS=0`. Deterministic demos via `POST /api/dev/chaos` `{ "failNext": { "versions": 1, "noteGets": 1, "conflicts": 1, "transitions": 1, "telemetry": 3 } }` or request header `X-Force-Conflict: 1`. Auto-seed 5000 notes unless `AUTO_SEED=0`. Telemetry routes skip random chaos so park demos stay deterministic.

```bash
curl -X POST http://localhost:3001/api/dev/seed -H 'content-type: application/json' -d '{"count":5000,"seed":42}'
```

## Auth & guards (Phase 3)

Client-side only (UX). Server remains authoritative.

| Layer | Mechanism |
|---|---|
| Route | `RequireCapability` → permission denied panel (≠ empty data) |
| Nav | Struck-through items with `title` reason |
| Action | `GuardedButton` disabled + reason tooltip |
| Session | Zustand `useSessionStore` (persisted); `X-Actor-Id` on API calls |

Capabilities live in `entities/user/model/permissions.ts`. Mock actors live in `entities/user/model/actors.ts` (dev role switcher only).

**No real IdP in this take-home.** The assignment asks for role-based guards as UX, not Clerk/Auth0/OIDC. Phase 3 is simulated auth so we can prove route/action gating. A production swap would: replace `DEV_ACTORS` + switcher with token/`/me` → `setActor(user)`, keep the same `can(role, capability)` matrix. That is out of the planned phases unless we add it as an explicit bonus.

## Phase status

- [x] Phase 0 — Scaffold & contracts
- [x] Phase 1 — Domain state machine
- [x] Phase 2 — Dummy backend (+ API Lab UI at `/lab`)
- [x] Phase 3 — Auth shell + Query plumbing
- [x] Phase 4 — Virtualized notes list
- [x] Phase 5 — Note detail + SOAP editor
- [x] Phase 6 — Autosave & conflicts
- [x] Phase 7 — Real-time
- [x] Phase 8 — Offline queue
- [x] Phase 9 — Version history
- [x] Phase 10 — Telemetry
- [ ] Phase 11 — Simulation, tests, README polish
