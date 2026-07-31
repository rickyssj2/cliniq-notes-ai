# Soulside AI — Clinical Notes Workflow

Frontend take-home: AI-assisted clinical notes review SPA. Architecture over polish — domain state machine, optimistic concurrency, offline queue, real-time reconcile, virtualized scale, telemetry with PII redaction.

Build phases and “try in UI” walkthroughs live in [`docs/phases.md`](docs/phases.md). Deeper diagrams and ADRs: [`docs/00-index.md`](docs/00-index.md).

## Quick start

```bash
pnpm install
pnpm dev
```

- Web: [http://localhost:5173](http://localhost:5173)
- API health: [http://localhost:3001/api/health](http://localhost:3001/api/health) (proxied at `/api/health`)

API auto-seeds **100,000** notes (`SEED_COUNT`, default `100000`). First boot can take a few seconds. Smaller seed: `SEED_COUNT=500 pnpm dev:api`. Chaos defaults on; demos: `CHAOS=0`.

### Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Web + API |
| `pnpm test` | Unit/integration (domain + web Vitest) |
| `pnpm simulate` | Multi-reviewer API simulation (+ extra scenarios) |
| `pnpm simulate:scenarios` | Extra scenarios only |
| `pnpm test:e2e` | Playwright — 11 browser tests (boots API+web if needed) |
| `pnpm typecheck` | All packages |

## Workspace

| Package | Role |
|---|---|
| `apps/web` | Vite + React SPA (Feature-Sliced Design) |
| `apps/api` | Hono mock REST + WebSocket + deterministic seed |
| `packages/domain` | Shared types + pure `noteMachine` |
| `simulate_workflow.ts` | Assignment sim + extra API scenarios |

### Web FSD layout

```
apps/web/src/
  app/         # providers, styles, shell
  pages/       # routable screens
  widgets/     # composite UI blocks
  features/    # user-facing capabilities
  entities/    # business entities
  shared/      # ui, api, db, config, lib, telemetry, realtime, correlation, logging
```

Import rule: layers only depend downward (`app` → `pages` → `widgets` → `features` → `entities` → `shared`).

## Architecture overview

```mermaid
flowchart TB
  subgraph ui [Web FSD]
    Pages[pages / widgets]
    Feat[features]
    Ent[entities/note]
    Shared[shared api db telemetry realtime]
  end
  subgraph domain [packages/domain]
    SM[noteMachine]
  end
  subgraph clientState [Client state]
    TQ[TanStack Query]
    ZS[Zustand]
    DX[Dexie queues]
  end
  subgraph api [Hono :3001]
    REST[REST /api]
    WS[WebSocket /ws]
    Store[In-memory store]
  end
  Pages --> Feat --> Ent
  Feat --> Shared
  Ent --> SM
  Ent --> TQ
  Feat --> ZS
  Feat --> DX
  TQ --> REST
  Shared --> WS
  REST --> Store
  WS --> Store
  REST --> SM
```

**Effect flow (save):** draft (Zustand) → coalesced autosave → optimistic Query patch → POST version → ack / 409 merge / offline Dexie enqueue → drain on reconnect → WS `version_added` reconciled into Query (deduped by `eventId`).

---

## Design decisions

### State Topology — Where state lives

Your four layers are right. The full topology also includes a **pure domain machine**, an **in-memory telemetry buffer**, and **WebSocket presence/cursor** (not a fifth “source of truth” for notes).

```mermaid
flowchart TB
  subgraph navigational [Navigational]
    URL["URL search params<br/>filters · sort · search · note id"]
  end

  subgraph syncClient [Sync client UI — Zustand]
    ZS["session/actor · SOAP drafts · selection<br/>presence snapshot · conflict modal · connectivity"]
  end

  subgraph asyncServer [Async server cache — TanStack Query]
    TQ["notes list / detail / versions<br/>optimistic patches · WS reconcile<br/>gcTime 35m · offline-first reads"]
  end

  subgraph durableIntent [Durable client intent — Dexie]
    MQ["mutationQueue<br/>create_version / transition"]
    TP["telemetryPark<br/>failed batches after retries"]
  end

  subgraph ephemeralWire [Ephemeral / wire — not entity stores]
    BUF["Telemetry in-memory buffer"]
    WS["WebSocket cursor + presence"]
  end

  subgraph domain [Pure domain — packages/domain]
    SM["noteMachine — legal edges only<br/>no React · no I/O"]
  end

  URL -->|"query key inputs"| TQ
  ZS -->|"draft / dirty"| TQ
  ZS -->|"can / getAvailableActions"| SM
  TQ -->|"REST"| API[(Hono API)]
  MQ -->|"drain on online"| API
  BUF -->|"flush"| API
  BUF -.->|"park after N fails"| TP
  TP -->|"replay on online / flush"| API
  WS -->|"status / version / presence"| TQ
  WS -->|"dirty + foreign version → merge"| ZS
  API -->|"same TRANSITIONS"| SM
```

| Layer | Owns | Does not own |
|---|---|---|
| **URL** | Filters, sort, search, deep links | Note bodies |
| **Zustand** | Session actor + accessToken, drafts, selection, conflict UI, connectivity, presence snapshot | Server note entities |
| **TanStack Query** | Notes / versions / review events (server cache) | Typing keystrokes |
| **Dexie** | Mutation outbox + parked telemetry | Full offline notes replica |
| **noteMachine** | Lifecycle legality + lifecycle banners | Persistence / HTTP |
| **Telemetry buffer / WS** | Batching + live fan-in | Authoritative status |

Server entities stay out of Zustand. Dexie is durable *client intent*, not a notes cache.

More detail: [`docs/02-state-layers.md`](docs/02-state-layers.md).

### State Machine — How the note lifecycle is modelled

Implemented as a pure module in [`packages/domain/src/note-machine`](packages/domain/src/note-machine):

- **`TRANSITIONS`** — single table for legal edges + guards + effects
- **`can` / `transition`** — validate user intent before any API call
- **`applyServerStatusChange`** — WS / authoritative pushes use the same table (`source: "server"`)
- **`getAvailableActions`** — action bar; disabled buttons carry human-readable `reason`
- **`getLifecycleBanner`** — read-only / generating copy derived from status (UI does not hard-code `status === "LOCKED"`)
- UI must not hard-code status `if` trees for “what buttons exist”

```mermaid
stateDiagram-v2
  [*] --> GENERATING

  GENERATING --> READY_FOR_REVIEW: generation.complete
  GENERATING --> FAILED: generation.error
  FAILED --> GENERATING: regenerate

  READY_FOR_REVIEW --> IN_REVIEW: start_review
  IN_REVIEW --> READY_FOR_REVIEW: return
  IN_REVIEW --> APPROVED: approve
  IN_REVIEW --> REJECTED: reject

  REJECTED --> READY_FOR_REVIEW: resubmit

  APPROVED --> AMENDED: amend
  APPROVED --> LOCKED: grace_expired

  AMENDED --> IN_REVIEW: start_review

  LOCKED --> [*]
```

Each arrow maps 1:1 to a row in [`transitions.ts`](packages/domain/src/note-machine/transitions.ts). Happy path: `GENERATING → READY_FOR_REVIEW → IN_REVIEW → APPROVED → LOCKED` (plus `FAILED`, `REJECTED`, `AMENDED` branches).

#### Analogy: `noteMachine` ↔ React

| React | This codebase |
|---|---|
| **`react`** — pure rules for how UI state updates (no DOM) | **`noteMachine`** — pure rules for how note status updates (no HTTP/DOM) |
| **`react-dom`** — host that applies those rules to the browser | **`apps/api` + `apps/web`** — hosts that apply transitions via REST, WS, Query, and the UI |

You import the same machine on the server (reject illegal transitions) and in the client (derive buttons / optimistic intent). Swapping the host (different UI kit, different transport) does not rewrite the lifecycle — the same way swapping `react-dom` for another renderer does not rewrite React.

```bash
pnpm --filter @soulside/domain test
```

### Optimistic Updates — Apply and roll back

**Why:** Latency and chaos would make a “wait for ACK” UI feel broken. We paint local intent immediately, then reconcile or restore a snapshot.

| Surface | Apply | Rollback / reconcile |
|---|---|---|
| **SOAP autosave** | Coalesced saver patches detail (+ list `updatedAt`) before POST | On network/`500` restore snapshot; on `409` open merge (edits kept) |
| **Online transitions** | Patch list + detail status (+ local `ReviewEvent` with `local_…` id) before POST | Non-network reject → restore snapshot, toast, invalidate; HTTP ack / WS replace local event by matching transition |
| **Bulk transitions** | Optimistic infinite-list patches | Roll back failed rows; continue others |
| **Offline** | Intent lands in Dexie; timeline shows amber optimistic rows | Drain FIFO; SOAP `409`/forbidden → merge UI; lost claims toast + drop |

Demo: Demo FAB (**D**) → arm sticky **fail all transitions / version saves** (optionally with server delay) to watch optimism then rollback; clear the latch to resume normal acks.

### Concurrency — Version conflicts without data loss

`POST /api/notes/:id/versions` requires `baseVersionId`. Mismatch (or force/chaos) → `409 version_conflict` with content for `current` + `commonAncestor`. UI: three-way merge (yours / server / ancestor), word-level `diff`, resolve retargets `baseVersionId` to server head. Idempotent via `clientMutationId`.

List sort is stable: primary column × direction, then **`id` ascending** as a fixed tie-break (no flip with primary `order`).

### Offline — Write queue survives reloads

Dexie `mutationQueue` holds `create_version` / `transition` intents. Offline autosave coalesces pending version rows per note. Reload rehydrates SOAP from the queue. Reconnect drains FIFO; SOAP `409` / forbidden saves open the same merge UI (not silent discard); lost claims toast and drop so the queue continues. Foreign WS `version_added` on a clean draft toasts; dirty drafts still open the merge modal. Connectivity banner + header badge follow `navigator.onLine`. Query `gcTime` is 35m for cached offline reads.

### Real-Time — Reconcile channel with optimistic state

App-wide WebSocket: viewport note ids + open detail; `presence.join` on detail. Events dedupe by `eventId` (capped ~2k). Dirty draft + foreign `version_added` → merge UI. Reconnect: exponential backoff + jitter, resubscribe with `lastEventId`. HTTP ack and WS may arrive in either order — both paths are idempotent.

**Presence:** unsubscribe (scroll away) does **not** clear presence; only an explicit leave / actor switch does. Empty presence spam on scroll is avoided.

**At-least-once demo:** Demo FAB → **Resend last WS event (duplicate eventId)** — subscribed tabs toast and skip a second patch.

### Telemetry — Batch, retry, unload, PII redaction

Only public API: `track(name, props, { important? })`. Batches by size (20), timer (4s / 800ms if important), **route change** (`flush("route")` after `page.view`), and visibility/pagehide.

Send path: up to **3** attempts with **exponential backoff** (250ms × 2ⁿ); on exhaustion the batch is **parked in Dexie**. Props are redacted at enqueue **and again at send** so parked/replayed batches cannot leak PII. API rejects SOAP-ish keys as defense in depth.

**Parked rows after going online:** `window` `online` triggers `flush("online")`, which **resets attempt counters** and drains the park. Manual **Flush now** does the same.

Unload uses `sendBeacon` then `fetch({ keepalive: true })`.

### Correlation IDs — UI → HTTP → telemetry → WS

`shared/correlation` ambient id wraps saves / transitions / drain / merge / page views. `apiFetch` always sends `X-Correlation-Id`; API echoes it and attaches it to WS events. `track` / `reportError` / `shared/logging` merge the same field.

### Scale — List/detail/history at 100k+ notes

TanStack Virtual + infinite cursor query with a sliding `maxPages` window (bidirectional fetch). Filters/sort/search URL-persisted. Default seed **100k**. Detail version content loads on demand. Viewport-scoped WS subscriptions. Sort headers always show affordances (inactive `↕`, active ↑/↓).

### Keyboard shortcuts

Primary CTAs show their key on the button (green Start review / Approve / Amend; red Reject). Header **Shortcuts ?** opens the full list.

| Keys | Action |
|---|---|
| `?` | Shortcuts help |
| `D` | Toggle demo controls FAB (dev) |
| `T` | Toggle telemetry panel (dev) |
| `R` / `A` / `M` / `X` / `E` | Start review / Approve / Amend / Reject / Return |
| `⇧G` | Request regeneration (FAILED notes; bulk or detail) |
| `⌃S/O/A/P` (Mac) · `Alt+S/O/A/P` (Win/Linux) | Focus SOAP section (UI shows your OS only) |
| `⌘S` (Mac) · `Ctrl+S` (Win/Linux) | Save draft |
| `/` | Focus notes search |
| `g` `n` / `h` | Notes / Home |
| `j` / `k` / `Enter` | Row focus / open note |
| `Esc` | Close help / conflict |

### Testing — what we run and why

The assignment ships a **concurrency simulation script** (`simulate_workflow.ts`). We treat that as the **API/integration layer** and surround it with faster **unit** tests and one **E2E** smoke path.

#### Commands

| Command | Scope |
|---|---|
| `pnpm test` | Vitest — domain machine (44) + web modules (25) |
| `pnpm simulate` | Full sim: seed 5k → 3 reviewers × 20 notes under chaos → extra scenarios |
| `pnpm simulate:scenarios` | Extra scenarios only (overlap, admin edit, RT ordering, burst) |
| `pnpm test:e2e` | Playwright — 11 browser tests (see below) |

API must be running for `pnpm simulate` (`pnpm dev` or `pnpm dev:api`).

#### 1. Unit tests (Vitest, pure / fast)

| Module | File | What it proves |
|---|---|---|
| **State machine** | `packages/domain/src/note-machine/machine.test.ts` | Every transition edge, guards (assigned reviewer, **ADMIN break-glass**, MFA, grace window), `canEditContent`, `getAvailableActions`, `getLifecycleBanner`, server-driven status apply |
| **Optimistic transitions** | `apps/web/src/entities/note/lib/optimistic-transition.test.ts` | Local ReviewEvent mint + reconcile with HTTP/WS ack |
| **Autosave coalesce** | `apps/web/src/features/autosave-note/model/coalesced-saver.test.ts` | ≤1 in-flight save + ≤1 follow-up while typing |
| **Editor draft** | `apps/web/src/entities/note/model/editor-draft-store.test.ts` | Dirty tracking / hydrate |
| **Telemetry redact** | `apps/web/src/shared/telemetry/redact.test.ts` | PII keys stripped before batch POST |
| **Offline queue** | `apps/web/src/features/offline-queue/model/mutation-queue.test.ts`, `drain.test.ts` | Dexie coalesce per note, FIFO order, terminal 4xx discard on drain |
| **Realtime reconcile** | `apps/web/src/entities/note/lib/apply-realtime-event.test.ts` | `eventId` dedupe (at-least-once WS); seen-id cap so memory cannot grow forever |

These run in CI without a browser or live API.

#### 2. API simulation (`simulate_workflow.ts`) — assignment + “build your own”

Mirrors the PDF’s **three concurrent reviewers** pattern, then adds scenarios the UI must handle:

| Phase | What it exercises |
|---|---|
| **Happy path** | Seed → `dr_a` / `dr_b` / `dr_c` each claim READY notes (race-safe), edit SOAP, resolve 409s, approve/reject under injected latency + ~3% 500 + ~2% conflict |
| **Overlapping editors** | Two saves from the same stale `baseVersionId` → `409 version_conflict` with `current` + `commonAncestor`; merge onto head |
| **Reject + admin + resubmit** | Reviewer rejects → **ADMIN** supersedes SOAP → clinician stale save gets **409 while still REJECTED** → clinician resubmits |
| **Realtime before ack** | WS `note.status_changed` may arrive before HTTP transition response — client must reconcile either order |
| **Burst fetches** | 500 sequential `GET /notes/:id` — load smoke (no crash) |

The sim retries transient 500s (chaos) and uses `clientMutationId` like the SPA.

#### 3. E2E (Playwright) — real browser, slowest, highest confidence

Playwright drives Chromium like a user: clicks, typing, dialogs, navigation. **`pnpm test:e2e`** boots API + Vite automatically (`CHAOS=0` for stability). Tests run **one worker** because the mock API is a single in-memory store.

| File | Test | What only E2E can catch |
|---|---|---|
| `smoke.spec.ts` | Approve happy path | Routing, actor menu, filters, autosave timing, MFA confirm |
| `workflows.spec.ts` | Reject + reason modal | Reject dialog, status badge, read-only after reject |
| `workflows.spec.ts` | Force conflict → merge | Demo FAB, 409 modal, Resolve & save |
| `access-control.spec.ts` | Auditor read-only | Capability + SOAP `disabled` in real DOM |
| `access-control.spec.ts` | Unassigned reviewer | Assignment gate message after actor switch |
| `access-control.spec.ts` | Admin approves others’ note | ADMIN break-glass in action bar |
| `access-control.spec.ts` | URL filter deep link | `?status=` survives back navigation |
| `concurrency.spec.ts` | Two tabs overlapping edit | Loser’s SOAP kept in merge modal |
| `offline.spec.ts` | Offline queue → remount → drain | Dexie + connectivity; no silent wipe |
| `realtime.spec.ts` | WS before held HTTP ack | Approve paints while POST body delayed |
| `session-soak.spec.ts` | Open 25 notes | Session stays healthy (not heap profiling) |

Shared helpers live in `e2e/helpers.ts` (`actAs`, `claimReadyNote`, `setBrowserOffline`, etc.).

**Assignment scenario coverage:** overlapping editors, offline queue reconnect, and RT-before-ack are now E2E-proven; reject/admin/resubmit stays in `pnpm simulate`; 500-note leak is API burst + light session soak (not full heap instrumentation).

#### What we deliberately skip

Full UI permutation matrix, visual regression, 100k-row render benchmarks in CI, literal 20-minute offline sleep (Dexie + `gcTime` 35m + offline E2E cover intent; hard reload while offline can’t boot Vite without a service worker).

See also [`docs/12-testing-and-performance.md`](docs/12-testing-and-performance.md).

### Performance — React Compiler posture & explicit optimizations

**React Compiler:** not enabled in this repo. We use **React 19** with `@vitejs/plugin-react` only. The compiler would auto-memoize components/hooks at build time; here we rely on **structural** optimizations so list/detail stay fast at 100k scale without a Babel compiler pass.

| Technique | Where | Effect |
|---|---|---|
| **Route code splitting** | `apps/web/src/app/routes/index.tsx` | `React.lazy` per page (Home, Notes, Detail, Admin) + `Suspense` fallback |
| **Deferred feature chunks** | `apps/web/src/app/providers/index.tsx` | Telemetry panel lazy-loaded; conflict host stays eager (offline-safe) |
| **List virtualization** | `widgets/notes-table` + `@tanstack/react-virtual` | Only visible rows mount; 100k notes stay O(viewport) DOM |
| **Cursor pagination** | `useNotesInfiniteQuery` | Server pages notes; client never holds full dataset |
| **TanStack Query cache** | `shared/api/query-client.ts` | `staleTime` 30s, `gcTime` 35m (`offlineFirst`) — cached reads survive brief offline |
| **Scoped WS subscriptions** | `shared/realtime/client.ts` | Subscribe virtualizer-visible ids + open detail only (not all 100k) |
| **Coalesced autosave** | `features/autosave-note` | Debounce + single in-flight POST reduces network churn |
| **Stable Zustand selectors** | entities/features | `EMPTY_PRESENCE` sentinel, narrow selectors — fewer wasted renders |
| **Production chunks** | `pnpm --filter @soulside/web build` | Vite splits routes/features (see `dist/assets/*`) |

**If enabling React Compiler later:** add `babel-plugin-react-compiler` to the Vite React plugin, verify with [eslint-plugin-react-hooks](https://www.npmjs.com/package/eslint-plugin-react-hooks) `react-compiler` rules, and re-run Playwright smoke — most explicit `useMemo` calls could then be removed incrementally.

### Accessibility — Keyboard, SR, WCAG 2.2 AA

**Posture:** aim for WCAG 2.2 AA on critical flows; architecture over polish.

| Area | Status |
|---|---|
| Primary nav / role switcher | Landmark + labelled control |
| Notes filters / table | Native controls; row checkboxes use visible `sr-only` label text |
| SOAP editor | Per-section `<label>` + `aria-label` on textareas |
| Actions | Disabled buttons expose machine `reason` via `title` |
| Conflict modal | `role="dialog"` + labelled title |
| Shortcuts | App-wide keys + help dialog |
| **Gaps** | No full axe CI; conflict focus trap is light; live regions for status/presence are minimal |

### Error handling & authorization posture

**Error handling:** API failures surface as actionable UI (rollback, merge, queue hint). Nested `react-error-boundary` + `window` / Query `onError` → `track("ui.error")`. Structured `shared/logging` carries correlation ids. Mutation queue may hold clinical text in IndexedDB — production hardening: encryption-at-rest.

**Authorization (demo JWT, not a production IdP):**

1. Boot / “Act as” calls `POST /api/dev/token` with a seeded `actorId` → short-lived HS256 JWT (`sub` + `role`).
2. `apiFetch` sends `Authorization: Bearer …` on every notes call. Session also keeps `X-Actor-Id` for debugging — **the API ignores it for authz**.
3. Notes routes verify the JWT and force `actorId` from claims on versions/transitions (body cannot spoof identity).
4. Client capability matrix + `noteMachine` still gate UX; server remains authoritative for transitions and edit gates.
5. Demo FAB → **Showcase invalid vs valid token** proves missing / invalid / header-only → `401`, session JWT → `200`.

Trade-off: `/api/dev/token` has no password (pattern demo). Production would replace minting with OIDC / httpOnly session cookies and keep the same claim-driven server checks. Telemetry and `/api/dev/*` (seed, chaos, token) stay open for demos; clinical mutation surface is Bearer-gated.

---

## Assumptions

1. Single mock API process; in-memory store resets on restart (seed is deterministic).
2. No real IdP — “Act as” mints a **demo JWT** for a known seeded user (no password).
3. MFA for approve is a `window.confirm` stand-in.
4. “20 minutes offline” is demonstrated by Dexie durability across reload, not a literal CI sleep.
5. Evaluators run locally on Node 20+ / modern Chromium; no deploy required.
6. Random chaos may flake a single click; use `CHAOS=0` or sticky Demo fail latches; sim retries 500s.
7. Sticky fail-next for transitions/versions stays armed until cleared (intentional for rollback demos).

---

## Dummy API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Store stats |
| POST | `/api/dev/token` | Mint demo JWT `{ actorId }` → `{ accessToken, expiresIn, actor }` |
| POST | `/api/dev/seed` | `{ count, seed? }` (max 100k) |
| GET | `/api/dev/users` | Seeded actors |
| GET | `/api/dev/ready-note` | First `READY_FOR_REVIEW` |
| GET/POST | `/api/dev/chaos` | Latency / rates / `ackDelayMs` / sticky `failNext` latches |
| POST | `/api/dev/realtime/duplicate` | Rebroadcast last WS event with same `eventId` |
| GET | `/api/notes` | Cursor + filters/sort (**Bearer required**) |
| GET | `/api/notes/:id` | Detail + versions meta + review events |
| GET | `/api/notes/:id/versions/:versionId` | Full version content |
| POST | `/api/notes/:id/versions` | Actor from JWT; `baseVersionId`, `content`, `clientMutationId` |
| POST | `/api/notes/:id/transitions` | Actor from JWT; validated by `noteMachine` |
| POST | `/api/telemetry/batch` | Batched events; rejects PII-ish keys |
| GET | `/api/telemetry/recent` | Batch summaries |
| WS | `/ws` | `subscribe` / `replay` / `presence.join` |

Chaos (default on): latency, ~5% `500`, ~2% version conflicts. `CHAOS=0` disables random chaos. Demo latches via `POST /api/dev/chaos`:

- `ackDelayMs` — fixed pre-handler delay (even when `CHAOS=0`)
- `failNext.transitions` / `failNext.versions` — **sticky** while > 0 (all matching requests 500 until cleared)
- `failNext.telemetry` / `noteGets` / `conflicts` — one-shot counters

## Auth & guards

| Layer | Mechanism |
|---|---|
| Transport | Bearer JWT on `/api/notes/*`; identity from verified claims |
| Route | `RequireCapability` → permission denied panel |
| Nav | Struck-through items with `title` reason |
| Action | Disabled + machine/capability reason |
| Session | Zustand persist (`actor` + `accessToken`); remint on boot / Act as |

---

## Demo FAB (dev, key `D`)

Collapsible sections with active badges; `?` tips for copy. Global controls:

| Control | Behavior |
|---|---|
| Server delay | Sticky `ackDelayMs` on all API requests |
| Fail-next | Sticky fail **all** transitions **or** all version saves until Clear |
| Auth (JWT) | Probe missing / invalid / `X-Actor-Id`-only vs session Bearer |
| Realtime | Duplicate last WS `eventId` |
| This page | Empty-workspace showcase, force 409, fail saves, throw boundaries |

---

## Assignment verification checklist

Mapped from *Frontend System Design and Architecture Assignment.pdf*. Status reflects this repo.

### Deliverables

| Requirement | Status | Evidence |
|---|---|---|
| GitHub-ready complete source | Done | Monorepo `apps/web`, `apps/api`, `packages/domain` |
| README: run, architecture, decisions, assumptions | Done | This file (ten required design topics + evaluation mapping) |
| State-machine as code (and diagram) | Done | `packages/domain` + diagram above |
| Own test scenarios beyond sim script | Done | Vitest + `simulate:scenarios` + Playwright (11) |
| Optional architecture diagrams | Done | Mermaid in README + `docs/` |

### Evaluation criteria (what we look for)

| Criterion | How this repo answers |
|---|---|
| **Frontend architecture** | FSD layers; domain package; swap transport/UI without rewriting lifecycle |
| **State modelling & invariants** | Pure `TRANSITIONS` / `can` / `applyServerStatusChange`; UI from `getAvailableActions` |
| **Concurrency & consistency** | Optimistic apply/rollback; 409 three-way merge; WS `eventId` dedupe; `clientMutationId` |
| **Performance & scale** | Virtualized cursor list @ 100k; scoped WS; Query windowing |
| **Async & effect discipline** | Coalesced autosave; Query keys; WS backoff; telemetry batch + park; queue drain |
| **Accessibility** | Keyboard map, labels, dialog roles; stated WCAG 2.2 AA posture + gaps |
| **Testing strategy** | Unit machine + effectful modules; API sim; Playwright (11: smoke, workflows, ACL, concurrency, offline, realtime, soak) |
| **Design considerations** | Errors, logging, demo JWT authz, PII redaction, ADRs in `docs/09` |

### Functional — Notes list

| Requirement | Status | Notes |
|---|---|---|
| Cursor-paginated virtualized list @ 100k+ | Done | TanStack Virtual + infinite query; default seed 100k |
| Filter panel (status, reviewer, dates) URL-persisted | Done | Patient free-text via search; no separate patient multi-select control |
| Debounced server search; empty ≠ no-results | Done | |
| Sortable columns, URL-persisted | Done | Stable secondary sort by `id` ascending |
| Bulk actions; selection across scroll | Done | Assign-me / regenerate |
| Skeleton / optimistic row updates | Done | |

### Functional — Note detail

| Requirement | Status | Notes |
|---|---|---|
| SOAP sections independently dirty-tracked | Done | |
| Version history + word-level diff | Done | Character-level = bonus, not done |
| Status-driven action bar with reasons | Done | `getAvailableActions` |
| LOCKED read-only | Done | Amend is from **APPROVED** within 24h (machine), not from LOCKED |
| Live presence | Done | |

### State machine engine

| Requirement | Status |
|---|---|
| Pure unit-testable module | Done |
| Validate before API; rollback on reject | Done |
| Server-pushed transitions through same machine | Done |
| Optimistic local ReviewEvent + reconcile | Done |

### Autosave & conflicts

| Requirement | Status |
|---|---|
| Debounced autosave while dirty | Done |
| Coalesce: ≤1 in-flight + ≤1 follow-up | Done |
| `baseVersionId` + three-way merge on 409 | Done |
| `clientMutationId` idempotency | Done |

### Offline

| Requirement | Status |
|---|---|
| Usable offline ≥30m from cache | Done | `gcTime` 35m + queue |
| Write queue survives reload (IndexedDB) | Done | Dexie |
| Ordered replay + same merge UI | Done | |
| Non-modal connectivity status | Done | |

### Real-time

| Requirement | Status |
|---|---|
| Viewport + detail subscribe/unsubscribe | Done |
| Merge with optimistic; same conflict UI | Done |
| Backoff + jitter; `lastEventId` replay | Done |

### Telemetry

| Requirement | Status |
|---|---|
| `track()` only; batched flush | Done | Size/timer/**route**/visibility |
| Retry → park in IDB; unload beacon | Done | Exponential backoff; send-time re-redact |
| PII redaction | Done | Client + API reject |

### Authorization

| Requirement | Status |
|---|---|
| Roles CLINICIAN / REVIEWER / ADMIN / READONLY_AUDITOR | Done |
| Route / component / action guards; denied ≠ empty | Done |
| **ADMIN** break-glass: all user transitions + SOAP edit in `IN_REVIEW` | Done |
| Server-verified identity (demo JWT Bearer) | Done | Claims authoritative; `/dev/token` is not a real IdP |

### Dummy backend + simulation

| Requirement | Status |
|---|---|
| Latency + ~5% failure; mock WS; deterministic seed | Done |
| `simulate_workflow.ts` multi-reviewer path | Done |
| Extra scenarios (overlap, offline intent, RT-before-ack, …) | Done |

### Required design write-ups

All ten topics addressed in **Design decisions** above (topology, machine, optimistic, concurrency, offline, real-time, telemetry, scale, testing, accessibility).

### Bonuses present

| Bonus | Status |
|---|---|
| Word-level diffs | Done |
| Correlation IDs + structured logging | Done |
| CRDT collab / plugins / flags / workers / PWA / federation | Not done |

### Local verification

- [ ] `pnpm dev` — list virtualizes at 100k; detail autosaves; two-tab Live updates
- [ ] Force 409 — merge UI keeps both sides’ intent
- [ ] Offline edit → soft remount → online drain (`pnpm test:e2e` covers this)
- [ ] Demo **D**: sticky fail transitions + delay → optimistic rollback; Clear → works again
- [ ] Demo **D**: JWT showcase (401 / 401 / 401 / 200)
- [ ] Telemetry Fail×3 → park → Flush now / go online → park clears; navigate routes flushes
- [ ] WAVE: notes checkboxes announce patient / “Select all…” (not empty labels)
- [ ] `?` opens shortcuts; `/` focuses search
- [ ] `pnpm test` / `pnpm simulate` / `pnpm test:e2e` green
