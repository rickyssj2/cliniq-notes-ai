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
2. As **Auditor Lee**: Notes works (empty data). Review queue / Admin / API Lab show **Permission denied** (not empty). Nav items are struck through with hover reasons. On Notes, **Bulk assign** is disabled with a reason tooltip
3. As **Dr. A (REVIEWER)**: Review queue opens; Admin stays denied; Bulk assign enables
4. As **Admin Kim**: Admin + Review queue + Lab all open
5. Reload the page — the selected actor persists (Zustand + localStorage)

### Try in UI — Phase 4

1. Ensure API is running (auto-seeds 5000 notes). Open http://localhost:5173/notes
2. Scroll the list — more pages load; footer shows loaded / matching counts
3. Toggle status chips, search (debounced), reviewer, dates — URL updates; copy/paste the URL to deep-link
4. Click column headers (Status / Updated / Created) to sort
5. Select rows across scroll; use **Start review** / **Request regeneration** on the sticky bulk bar (as REVIEWER/ADMIN). Watch optimistic status chips update
6. Clear filters vs search with no matches — empty workspace vs **no results** messaging differ
7. Click a patient name → detail stub (Phase 5)

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
- **Zustand (`entities/user`)** — session/actor (persisted); more client UI stores later
- **TanStack Query** — wired in `app` providers (server entities land Phase 4+)
- **Dexie** — opened at boot; queues used Phase 8/10
- **URL** — filters later (Phase 4)

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

_Phase 4 (list):_ bulk transitions patch the TanStack Query infinite-list cache optimistically, then reconcile with the server response or roll back on failure. Editor autosave optimism lands in Phase 6.

### Concurrency — Version conflicts without data loss

_Server side (Phase 2):_ `POST /api/notes/:id/versions` requires `baseVersionId`; mismatch (or chaos injection) returns `409 version_conflict` with `current` + `commonAncestor`. Client merge UI lands in Phase 6. Mutations are idempotent via `clientMutationId`.

### Offline — Write queue survives reloads

_Pending — Phase 8 (Dexie)._

### Real-Time — Reconcile channel with optimistic state

_Server side (Phase 2):_ `ws://localhost:3001/ws` (proxied as `/ws`). Clients `subscribe` with `noteIds` + optional `lastEventId` for replay. Events: `note.status_changed`, `note.version_added`, `note.presence`. Client reconciliation lands in Phase 7.

### Telemetry — Batch, retry, unload, PII redaction

_Pending — Phase 10._

### Scale — List/detail/history at 100k+ notes

_Phase 4:_ TanStack Virtual + infinite cursor query on `/notes`. Filters/sort/search URL-persisted. Seed up to 100k via `POST /api/dev/seed`. Detail/history virtualization continues in later phases.

### Testing — Unit, integration, e2e posture

- **Unit (done):** 32 Vitest cases for every legal/illegal edge, guard failure reasons, grace window, server-driven path, READONLY_AUDITOR, and `getAvailableActions`
- **API smoke (Phase 2):** seed, list, transition, idempotent version save, 409 conflict, WebSocket subscribe/presence
- **Integration / e2e:** deferred to later phases

### Accessibility — Keyboard, SR, WCAG 2.2 AA

_Pending — built on shadcn/Radix primitives; posture documented by Phase 11._

## Dummy API (Phase 2)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Store stats |
| POST | `/api/dev/seed` | `{ count, seed? }` deterministic |
| GET | `/api/dev/users` | Seeded actors (`dr_a`…, clinicians, …) |
| GET | `/api/dev/ready-note` | First `READY_FOR_REVIEW` |
| GET | `/api/notes` | Cursor + `status`, `reviewerId`, `patientId`, `q`, `sort`, `order`, `limit` |
| GET | `/api/notes/:id` | Detail + versions + review events |
| POST | `/api/notes/:id/versions` | `baseVersionId`, `content`, `clientMutationId` |
| POST | `/api/notes/:id/transitions` | `{ to, actorId, reason?, mfaVerified?, clientMutationId? }` — validated by `noteMachine` |
| WS | `/ws` | `subscribe` / `replay` / `presence.join` |

Chaos (default on): 100–800ms latency, ~5% `500`, ~2% forced version conflicts. Disable with `CHAOS=0`. Auto-seed 5000 notes unless `AUTO_SEED=0`.

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
- [ ] Phase 5 — Note detail + SOAP editor
- [ ] Phase 6 — Autosave & conflicts
- [ ] Phase 7 — Real-time
- [ ] Phase 8 — Offline queue
- [ ] Phase 9 — Version history
- [ ] Phase 10 — Telemetry
- [ ] Phase 11 — Simulation, tests, README polish
