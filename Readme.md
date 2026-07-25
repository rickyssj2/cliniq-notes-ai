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
- **Planned:** TanStack Query (server entities), Zustand (client UI), Dexie (durable queues), URL (filters)

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

_Pending — Phases 4–6._

### Concurrency — Version conflicts without data loss

_Server side (Phase 2):_ `POST /api/notes/:id/versions` requires `baseVersionId`; mismatch (or chaos injection) returns `409 version_conflict` with `current` + `commonAncestor`. Client merge UI lands in Phase 6. Mutations are idempotent via `clientMutationId`.

### Offline — Write queue survives reloads

_Pending — Phase 8 (Dexie)._

### Real-Time — Reconcile channel with optimistic state

_Server side (Phase 2):_ `ws://localhost:3001/ws` (proxied as `/ws`). Clients `subscribe` with `noteIds` + optional `lastEventId` for replay. Events: `note.status_changed`, `note.version_added`, `note.presence`. Client reconciliation lands in Phase 7.

### Telemetry — Batch, retry, unload, PII redaction

_Pending — Phase 10._

### Scale — List/detail/history at 100k+ notes

_Server side (Phase 2):_ cursor pagination on `GET /api/notes` (filters, sort, search). Client virtualization in Phase 4. Seed up to 100k via `POST /api/dev/seed`.

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

## Phase status

- [x] Phase 0 — Scaffold & contracts
- [x] Phase 1 — Domain state machine
- [x] Phase 2 — Dummy backend (+ API Lab UI at `/lab`)
- [ ] Phase 3 — Auth shell + Query plumbing
- [ ] Phase 4 — Virtualized notes list
- [ ] Phase 5 — Note detail + SOAP editor
- [ ] Phase 6 — Autosave & conflicts
- [ ] Phase 7 — Real-time
- [ ] Phase 8 — Offline queue
- [ ] Phase 9 — Version history
- [ ] Phase 10 — Telemetry
- [ ] Phase 11 — Simulation, tests, README polish
