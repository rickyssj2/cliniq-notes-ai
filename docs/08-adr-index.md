# ADR index — choices and tradeoffs

Short Architecture Decision Records. Each answers: **Chose X over Y because Z.**

---

### ADR-01 — Pure `noteMachine` module (not XState / Redux)

**Chose:** Hand-rolled transition table in `packages/domain`.  
**Over:** XState, Redux Toolkit, status `if`s in components.  
**Because:** Same pure module validates SPA *and* mock API; zero runtime framework tax; trivial to unit test (44 cases).  
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
**Because:** Interview-visible capability boundaries matching build phases.  
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

**Chose:** Domain unit (44) + web effectful modules (25) + API sim + Playwright (11).  
**Over:** Exhaustive UI permutation / visual regression / 100k CI timing.  
**Because:** Protects invariants and critical paths; chaos/scale verified manually via seed + Demo FAB.  
**Tradeoff:** Gaps in a11y CI and long wall-clock offline sleeps — documented deliberately.

---

### ADR-11 — Sticky Demo fail latches (transitions / versions)

**Chose:** While `failNext.transitions|versions > 0`, every matching request 500 until Demo Clear.  
**Over:** One-shot decrement.  
**Because:** Rollback demos need repeated failures with optional server delay; one-shot cleared before the reviewer could observe optimism.  
**Tradeoff:** Easy to leave armed — UI badges + Clear control; sim sets `failNext: {}` when stabilizing scenarios.
