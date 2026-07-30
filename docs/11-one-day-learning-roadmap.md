# One-day learning roadmap (8–10 hours)

Goal: understand every architecture doc in `docs/` well enough to **defend tradeoffs** in a frontend system design interview — not become a general architecture expert.

**How to use:** follow blocks in order. Each block: **consume → map to this repo → teach-back (speak aloud 2–3 min)**. Skip anything you can already explain cold.

**Diagrams:** docs `01`–`08` each have **LucidChart-style PNG**, **ASCII blocks**, and optional **Mermaid** — use whichever clicks for you.

**Budget:** ~9 hours total (±1h). Hard stop when the day ends — revisit flashcards tomorrow, don’t expand scope.

---

## Schedule at a glance

| Block | Topic | Time | Docs to open |
|---|---|---|---|
| 0 | Orient | 30m | this file + `10-interview-talk-track.md` |
| 1 | Hexagonal + FSD | 90m | `01`, `08` |
| 2 | State topology (TQ vs Zustand) | 90m | `02` |
| 3 | Domain state machine | 60m | `03` |
| 4 | Optimistic UI + 409 merge | 90m | `04`, `05` |
| 5 | Offline outbox | 60m | `06` |
| 6 | Realtime reconcile | 60m | `07` |
| 7 | ADRs + mock grill | 60–90m | `09`, `10` |

**Breaks:** 5–10 min between blocks. Lunch after block 3 or 4.

---

## Block 0 — Orient (30 min)

1. Skim [Root README — Design decisions](../Readme.md) (State Topology → Testing).  
2. Read `docs/10-interview-talk-track.md` — the 5-minute tour once silently.  
3. Run `pnpm dev` if possible; open `/notes` and `/lab` so later mental models attach to UI.

**Exit check:** You can list the seven bullets of the 5-minute tour without looking.

---

## Block 1 — Hexagonal architecture + FSD (90 min)

### Consume (~55 min)

| # | Resource | Type | ~Time | Why |
|---|---|---|---|---|
| 1 | [Hexagonal Architecture (Cockburn, archived original)](https://web.archive.org/web/20090122225311/http:/alistair.cockburn.us/Hexagonal+architecture) | Article | 25m | Ports/adapters from the source — *inside vs outside* |
| 2 | [Hexagonal Architecture explained (CodeOpinion) — YouTube](https://www.youtube.com/watch?v=bDWApqAHSKI) | Video | 15m | Visual ports/adapters without backend rabbit holes |
| 3 | [FSD — Overview](https://feature-sliced.design/docs/get-started/overview) | Docs | 10m | Layers / slices purpose |
| 4 | [FSD — Layers & import rule](https://feature-sliced.design/docs/reference/layers) | Docs | 10m | Exactly what `apps/web/src` follows |

### Map to repo (~20 min)

- Open `docs/01-hexagonal-architecture.md` and `docs/08-fsd-dependency-map.md`.  
- Open `packages/domain/src/note-machine/` and `apps/web/src/features/transition-note/`.  
- Point at: core = machine; driving = action bar; driven = REST/WS/Dexie.

### Teach-back (~15 min)

Explain aloud: *“Domain has no React. UI asks `can`/`transition`. Effects are applied by the API adapter.”*  
Name one **illegal** FSD import.

---

## Block 2 — Server state vs client state (90 min)

### Consume (~55 min)

| # | Resource | Type | ~Time | Why |
|---|---|---|---|---|
| 1 | [Does TanStack Query replace client state?](https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state) | Official | 15m | The boundary we implemented |
| 2 | [Practical React Query (TkDodo)](https://tkdodo.eu/blog/practical-react-query) | Article | 25m | Defaults, staleTime mental model |
| 3 | [React Query vs Zustand / when to use which — YouTube (Jack Herrington)](https://www.youtube.com/watch?v=J-gC3zSwaAs) | Video | 15m | Short compare; map to our split |

If short on time: skip #3, keep #1–2.

### Map to repo (~20 min)

- `docs/02-state-layers.md`  
- `apps/web/src/shared/api/query-client.ts` — note `gcTime: 35m`, mutations `retry: false`  
- Find one Zustand store (session / draft / connectivity) and one note query hook

### Teach-back (~15 min)

For each item, say where it lives: list filters · dirty SOAP · note detail · pending offline save · presence avatars.

---

## Block 3 — Finite state machines for workflows (60 min)

### Consume (~35 min)

| # | Resource | Type | ~Time | Why |
|---|---|---|---|---|
| 1 | [State Machines in User Interfaces (David Khourshid) — YouTube](https://www.youtube.com/watch?v=D5W0tY3-xDs) | Video | 20–25m | Why UI status flags become bugs |
| 2 | Skim [XState intro docs](https://stately.ai/docs/xstate) *or* stay with our table — goal is **FSM idea**, not adopt XState | Docs | 10m | Context for ADR-01 “why not XState” |

### Map to repo (~15 min)

- `docs/03-note-lifecycle-state-machine.md`  
- Read `TRANSITIONS` in `packages/domain/src/note-machine/transitions.ts`  
- Trace `approve` guard (assigned + MFA) and `source: "server"`

### Teach-back (~10 min)

Draw the happy path from memory: `GENERATING → … → LOCKED`, plus `REJECTED` and `AMENDED` branches.

---

## Block 4 — Optimistic updates + version conflicts (90 min)

### Consume (~50 min)

| # | Resource | Type | ~Time | Why |
|---|---|---|---|---|
| 1 | [Optimistic Updates — TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates) | Official | 20m | Snapshot + rollback pattern |
| 2 | [TkDodo — Concurrent Optimistic Updates](https://tkdodo.eu/blog/concurrent-optimistic-updates) | Article | 15m | Why naive optimism races |
| 3 | [Three-way merge (conceptual) — Wikipedia](https://en.wikipedia.org/wiki/Merge_(version_control)#Three-way_merge) | Skim | 10m | Ancestor / ours / theirs vocabulary |

Optional if you want concurrency vocabulary (10m): [Idempotency keys (Stripe)](https://stripe.com/docs/api/idempotent_requests) — maps to `clientMutationId`.

### Map to repo (~25 min)

- `docs/04-sequence-save-happy-path.md`, `docs/05-sequence-conflict-409.md`  
- `features/autosave-note`, `features/resolve-conflict`  
- Note: mutations don’t auto-retry; Retry reuses mutation id

### Teach-back (~15 min)

Walk: type → coalesce → optimistic patch → 409 → rollback → merge → save with new `baseVersionId`.

---

## Block 5 — Offline outbox / IndexedDB intent (60 min)

### Consume (~30 min)

| # | Resource | Type | ~Time | Why |
|---|---|---|---|---|
| 1 | [Outbox pattern (Microservices.io)](https://microservices.io/patterns/data/transactional-outbox.html) | Article | 15m | Same idea: durable intent before side effect |
| 2 | [Dexie.js — Getting started](https://dexie.org/docs/Tutorial/Getting-started) | Docs skim | 10m | Enough to read our queue tables |
| 3 | Optional video: [IndexedDB — Google Chrome Developers](https://www.youtube.com/watch?v=ASYOxIvoYf8) | Video | 10m | Only if IDB is brand new |

### Map to repo (~20 min)

- `docs/06-sequence-offline-queue.md`  
- `features/offline-queue/model/mutation-queue.ts` + `drain.ts`  
- Contrast: queue ≠ notes cache; `gcTime` keeps *reads* available briefly offline

### Teach-back (~10 min)

Explain: offline edit → enqueue → reload rehydrate → online drain → 409 still opens merge.

---

## Block 6 — WebSocket reconcile + races (60 min)

### Consume (~30 min)

| # | Resource | Type | ~Time | Why |
|---|---|---|---|---|
| 1 | [MDN — Writing WebSocket client apps](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications) | Docs | 15m | Reconnect mental model |
| 2 | [TkDodo — Using WebSockets with React Query](https://tkdodo.eu/blog/using-webSockets-with-react-query) | Article | 15m | Patch cache from push events |

### Map to repo (~20 min)

- `docs/07-realtime-reconcile.md`  
- `shared/realtime/` + `entities/note/lib/apply-realtime-event.ts`  
- Note `eventId` dedupe cap and `lastEventId` replay

### Teach-back (~10 min)

Explain why HTTP ack and WS event can arrive either order — and why both paths must be idempotent.

---

## Block 7 — ADR flashcards + mock grill (60–90 min)

1. Read `docs/09-adr-index.md` end-to-end once (20m).  
2. Cover ADR titles; answer each in **60–90s** using `docs/10-interview-talk-track.md` (30m).  
3. **Self-mock (20–30m):** whiteboard blank → redraw (1) state layers (2) save/409 sequence (3) offline outbox. Timebox 15 min drawing + 10 min “what would you change in prod?”

### Optional stretch (only if energy left)

- Telemetry/PII: skim README Telemetry section + `shared/telemetry` (15m).  
- Scale: TanStack Virtual docs overview — https://tanstack.com/virtual/latest (10m).

---

## End-of-day checklist

You are done when you can do **all** without notes:

- [ ] 5-minute architecture tour  
- [ ] Draw state layers (URL / Zustand / Query / Dexie / domain)  
- [ ] Draw note happy-path statuses  
- [ ] Narrate 409 merge and offline drain  
- [ ] Answer ADR-01 through ADR-06 cold  
- [ ] Name 3 production hardening items (real auth, encrypt queue, real DB)

## What *not* to study today

Skip deep dives (save for later if an interviewer goes there): full CRDTs/OT, OIDC internals, axe CI, Kubernetes, designing a second SPA framework. One-line “we’d add X in prod” is enough.

---

## Suggested commit splits

Commit each file alone if you want a clean history:

1. `01-hexagonal-architecture.md`  
2. `02-state-layers.md`  
3. `03-note-lifecycle-state-machine.md`  
4. `04` + `05` sequences (or separate)  
5. `06-sequence-offline-queue.md`  
6. `07-realtime-reconcile.md`  
7. `08-fsd-dependency-map.md`  
8. `09-adr-index.md`  
9. `10-interview-talk-track.md`  
10. `11-one-day-learning-roadmap.md` (this file)
