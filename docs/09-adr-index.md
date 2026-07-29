# ADR index — choices and tradeoffs

Short Architecture Decision Records for interview defense. Each answers: **Chose X over Y because Z.**

---

### ADR-01 — Pure `noteMachine` module (not XState / Redux)

**Chose:** Hand-rolled transition table in `packages/domain`.  
**Over:** XState, Redux Toolkit, status `if`s in components.  
**Because:** Same pure module validates SPA *and* mock API; zero runtime framework tax; trivial to unit test (32 cases).  
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

### ADR-08 — Simulated auth + capability matrix

**Chose:** “Act as” actors + client route/nav/action guards.  
**Over:** Real IdP/OIDC in take-home.  
**Because:** Demonstrates UX for denied permissions; server remains authoritative for transitions.  
**Tradeoff:** Not production auth — call out IdP + server session in “what next.”

---

### ADR-09 — Telemetry batch + park + PII redaction

**Chose:** In-memory batch → POST; after 3 failures park in Dexie; `redactProps` + API reject.  
**Over:** Fire-and-forget per event or shipping raw SOAP.  
**Because:** Unload durability (`sendBeacon` / keepalive) without leaking clinical text.  
**Tradeoff:** Best-effort analytics; parked rows need later flush.

---

### ADR-10 — Testing posture (pyramid, not exhaustive UI)

**Chose:** Domain unit + queue/realtime integration + API sim + one Playwright smoke.  
**Over:** Exhaustive UI permutation / visual regression / 100k CI timing.  
**Because:** Protects invariants and one critical path; chaos/scale verified manually via seed.  
**Tradeoff:** Gaps in a11y CI and long wall-clock offline sleeps — documented deliberately.
