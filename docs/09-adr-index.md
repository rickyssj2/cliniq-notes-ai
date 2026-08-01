# ADR index — choices and tradeoffs

Short Architecture Decision Records. Each answers: **Chose X over Y because Z.**

---

### ADR-01 — Pure `noteMachine` module (not XState / Redux)

**Chose:** Hand-rolled transition table in `packages/domain`.  
**Over:** XState, Redux Toolkit, status `if`s in components.  
**Because:** Same pure module validates SPA *and* mock API; zero runtime framework tax; trivial to unit test (46 cases).  
**Tradeoff:** Less visual tooling / interpreters than XState; we document edges in Mermaid instead.

---

### ADR-02 — TanStack Query for server entities; Zustand for UI session

**Chose:** Split server cache vs client UI state.  
**Over:** All notes in Zustand, or Redux holding async lists.  
**Because:** Notes are shared, staleable, multi-writer — Query’s job. Drafts/actor/modals are local and sync — Zustand’s job.  
**Tradeoff:** Two mental models; mitigated by the state-layers diagram.

---

### ADR-03 — Dexie as outbox only (not offline notes DB)

**Chose:** Persist `create_version` / `transition` intents (+ telemetry park).  
**Over:** Full IndexedDB replica of 100k notes.  
**Because:** Assignment needs durable intent across reload, not CRDT sync. Smaller surface, clearer failure modes.  
**Tradeoff:** Uncached detail unavailable offline; we show an explicit offline message.

---

### ADR-04 — Optimistic concurrency with three-way merge

**Chose:** `baseVersionId` + `409` + human merge UI.  
**Over:** Last-write-wins or automatic text merge.  
**Because:** Clinical SOAP must not silently drop another reviewer’s edits.  
**Tradeoff:** More UX complexity; justified by data-loss risk.

---

### ADR-05 — `clientMutationId` for idempotency

**Chose:** Client-generated mutation ids on version/transition POSTs.  
**Over:** Blind Query mutation retries.  
**Because:** Coalesced autosave + offline drain + 5xx retry must not create duplicate versions. Mutations have `retry: false` globally.  
**Tradeoff:** Call sites must thread the id consciously.

---

### ADR-06 — Viewport-scoped WebSocket subscriptions

**Chose:** Subscribe virtualizer-visible ids + open detail.  
**Over:** Global “all notes” stream or per-row sockets.  
**Because:** Bounds fan-out at 100k-scale lists; presence only where needed.  
**Tradeoff:** Must resubscribe on scroll/reconnect; handled in realtime client.

---

### ADR-07 — Feature-Sliced Design layout

**Chose:** `app/pages/widgets/features/entities/shared`.  
**Over:** Flat `components/` + `hooks/`.  
**Because:** A slice is a whole capability — UI, model, and API calls sit together, so one dev owns a feature end to end instead of editing four shared folders to ship it. That keeps several devs (or teams) out of each other's diffs: autosave, offline queue, and realtime each live in their own slice, and the downward-only import rule means a change inside one cannot quietly reach into another. Shared contracts move to `entities` / `shared` deliberately, which makes cross-team coupling a visible edit rather than an accident.  
**Tradeoff:** Folder ceremony for a take-home; accepted for clarity.

---

### ADR-08 — Demo JWT + capability matrix (not a real IdP)

**Chose:** “Act as” mints a short-lived HS256 JWT (`POST /api/dev/token`); notes API requires Bearer and takes `actorId`/`role` from claims. Client route/nav/action guards still use a capability matrix.  
**Over:** Trusting client `X-Actor-Id` / body.actorId alone, or wiring a full IdP in the take-home.  
**Because:** Shows server-authoritative identity + denied-permission UX without OIDC ceremony. Demo FAB proves invalid tokens fail.  
**Tradeoff:** `/dev/token` has no password — pattern demo only. Production: OIDC / httpOnly session; keep claim-driven server checks.

---

### ADR-09 — Telemetry batch + park + PII redaction

**Chose:** In-memory batch → POST with exponential backoff; after 3 failures park in Dexie; flush on route/visibility/unload; `redactProps` at enqueue **and** send; API rejects SOAP keys.  
**Over:** Fire-and-forget per event or shipping raw SOAP.  
**Because:** Session boundaries + unload durability without leaking clinical text.  
**Tradeoff:** Best-effort analytics; parked rows need later flush / online reset.

---

### ADR-10 — Testing posture (pyramid, not exhaustive UI)

**Chose:** Domain unit (46) + web effectful modules (33) + API sim + Playwright (20: 11 workflow + 9 axe WCAG 2.1 AA).  
**Over:** Exhaustive UI permutation / visual regression / 100k CI timing.  
**Because:** Protects invariants and critical paths; chaos/scale verified manually via seed + Demo FAB; axe suite scans reviewer states rather than routes.  
**Tradeoff:** Gaps in manual screen-reader passes and long wall-clock offline sleeps — documented deliberately.

---

### ADR-11 — The core folds its own effects (`applyTransition`)

**Chose:** `can` / `canTransitionTo` return effects, and `applyTransition` folds them into the next `LifecycleState`. Adapters store that and honour `requiresNewVersion`.  
**Over:** Each adapter switching over `TransitionEffect` itself (what the API store and the web patcher used to do).  
**Because:** Two exhaustive switches drift. They already had: a foreign `approve` left the reviewer assigned in the browser cache after the API released them, and `amend` kept a stale `approvedAt`. One fold, one place to extend.  
**Tradeoff:** The core now owns a small piece of state-shaping, not only decisions — accepted, since it shapes its own vocabulary (ids and flags) and never touches storage. Adapters keep the mapping they alone can do: id → `UserRef`, flag → version row.
