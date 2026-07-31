# Build phases & Try-in-UI guides

Incremental delivery history for this take-home. Product docs stay in [`../Readme.md`](../Readme.md); this file is the phase checklist and browser walkthroughs.

## Phase status

- [x] Phase 0 — Scaffold & contracts
- [x] Phase 1 — Domain state machine
- [x] Phase 2 — Dummy backend (API Lab removed; Demo FAB for fail-next / conflict)
- [x] Phase 3 — Auth shell + Query plumbing
- [x] Phase 4 — Virtualized notes list
- [x] Phase 5 — Note detail + SOAP editor
- [x] Phase 6 — Autosave & conflicts
- [x] Phase 7 — Real-time
- [x] Phase 8 — Offline queue
- [x] Phase 9 — Version history
- [x] Phase 10 — Telemetry
- [x] Phase 11 — Simulation, tests, README polish
- [x] Phase 12 — Error boundaries (`react-error-boundary`) + global/Query reporters
- [x] Phase 13 — Correlation IDs (HTTP / telemetry / WS) + tiny `shared/logging`
- [x] Phase 14 — Demo JWT (Bearer on notes) + sticky fail latches + Demo FAB polish

## Try in UI

### Phase 2 — Backend demos (Demo FAB)

1. Run `pnpm dev`, open Notes (API auto-seeds 100k)
2. Press **D** — collapsible Demo panel. Arm **server delay** and/or sticky **fail all transitions / version saves**; badges stay active until Clear
3. Open a READY note → Start review → edit → page controls: Force conflict / Fail all saves as needed
4. **Auth (JWT)** → Showcase invalid vs valid token (three 401s, one 200)
5. On a Live note detail, save once → **Resend last WS event** — duplicate `eventId` toast
6. Press **T** for the telemetry panel

### Phase 3 — Roles & guards

1. Open [http://localhost:5173](http://localhost:5173) — boot mints a demo JWT (“Signing in…”); header **avatar** switches roles (remints token)
2. As **Auditor Lee**: Notes works. Admin shows **Permission denied**. Nav items are struck through with hover reasons. On Notes, bulk actions are disabled with a reason tooltip
3. As **Dr. A (REVIEWER)**: Notes open; Admin stays denied; bulk assign enables
4. As **Admin Kim**: Admin opens
5. Reload the page — the selected actor persists (Zustand + localStorage); token remints on boot
6. Without Bearer (Postman bare GET `/api/notes`) → `401`; forged `X-Actor-Id` alone → `401`

### Phase 4 — Virtualized list

1. Ensure API is running (auto-seeds 100k notes by default). Open [http://localhost:5173/notes](http://localhost:5173/notes)
2. Scroll the list — more pages load; footer shows loaded / matching counts
3. Toggle status chips, search (debounced), reviewer, dates — URL updates; copy/paste the URL to deep-link
4. Click column headers (Status / Updated / Created) to sort
5. Select rows across scroll; use **Start review** (REVIEWER/ADMIN) / **Request regeneration** (CLINICIAN/ADMIN, FAILED only) on the sticky bulk bar. Bar shows eligible counts; ineligible are skipped with a message. Regen runs in parallel → `GENERATING`, stays subscribed until mock AI finishes (~5–15s) → `READY_FOR_REVIEW` (list refreshes via Live WS). Shortcut **⇧G**.
6. Clear filters vs search with no matches — empty workspace vs **no results** messaging differ
7. Click a patient name → detail (or use `j`/`k`/`Enter`)

### Phase 5 — Note detail

1. From `/notes`, open a `READY_FOR_REVIEW` note as **Dr. A**
2. Action bar shows **Start review** (from `getAvailableActions`). Start it — status becomes `IN_REVIEW`
3. Edit SOAP sections — each dirty section gets a **Dirty** badge; **Save draft** enables
4. Save (`⌘/Ctrl+S` or button) — revision bumps; dirty badges clear
5. Try **Approve** (confirm = mock MFA) or **Reject** (reason prompt)
6. Open a `LOCKED` note — editor read-only + lock message
7. As **Auditor Lee**, open any note — SOAP read-only (no `mutate_workflow`)

### Phase 6 — Autosave & conflicts

1. Open an `IN_REVIEW` note as **Dr. A**. Edit SOAP — watch status flip to dirty, then **Saving…** (~800ms), then **Saved**
2. Type quickly — saves coalesce (one in-flight POST; at most one follow-up)
3. Arm **Force conflict on next save**, edit, wait for autosave → three-way merge modal
4. Pick sections → **Resolve & save** — revision advances; idempotent `clientMutationId`
5. Demo (**D**) → arm **fail all version saves** (+ optional delay) → edit — optimistic paint rolls back on each attempt until Clear
6. Arm **fail all transitions** → Start review / Approve fail with toast + rollback until Clear
7. List filters survive detail ↔ back (search params preserved on Links)

### Phase 7 — Real-time

1. Open `/notes` — header badge should read **Live**
2. Open the same `IN_REVIEW` note in two browser tabs (optionally different actors via **Act as**)
3. In tab A, transition / edit+save — tab B list status chip and detail update without refresh; presence avatars appear
4. Switch **Act as** on an open note — old actor’s presence avatar clears; new actor re-joins
5. In tab A, edit SOAP and leave dirty; in tab B save a different edit — tab A opens the three-way conflict merge UI (same assignee, admin+assignee, or Demo force-conflict)
6. Kill the API briefly — badge shows **Reconnecting…**, then **Live**; missed events replay via `lastEventId`

### Phase 8 — Offline queue

1. Browse `/notes` while online, open an `IN_REVIEW` note
2. DevTools → Network → **Offline** — header badge flips to **Offline**, amber banner appears
3. Edit SOAP — autosave enqueues to IndexedDB; button may show **Queued**
4. ← Notes — cached list still shows; opening an uncached note shows **You’re offline**
5. Soft remount (← Notes then reopen / history) while offline — queued SOAP restores from Dexie (hard reload offline can’t boot Vite without a SW)
6. Go online — banner **Back online · syncing…**, queue drains, revision bumps

### Phase 9 — History & timeline

1. Open a note with multiple revisions (save a few SOAP edits while `IN_REVIEW`)
2. In **Version history**, click two revisions — SOAP word-diff appears (older → newer)
3. Run a transition — **Review timeline** shows the status edge
4. DevTools Offline → queue a transition or save — timeline shows an amber **Optimistic** row until sync

### Phase 10 — Telemetry

1. Bottom-right **Telemetry** (dev only) — open panel; counts for buffered / flushed / parked
2. **Emit sample** — Network → `POST /api/telemetry/batch`; body has `content`/`S` as `[redacted]`
3. Edit SOAP / run a transition — events batch (~4s or 20 events); **Flush now** to force send
4. **Fail ×3** — arms 3 injected 500s on the next telemetry batches (parks in IndexedDB); flush manually via **Flush now** or go online again (attempts reset)
5. Hard-refresh mid-buffer — `sendBeacon` / keepalive flush; parked rows survive reload

### Phase 11 — Sim & tests

1. With API up: `pnpm simulate` — three reviewers finish ~60 notes under chaos; extra scenarios assert 409 merge, **ADMIN edit on REJECTED**, RT-before-ack, burst fetches
2. `pnpm simulate:scenarios` — overlap / admin+resubmit / WS ordering / burst only (faster)
3. `pnpm test` — domain (44) + web (25) Vitest
4. `pnpm test:e2e` — Playwright **11 tests**: smoke, workflows, ACL, two-tab conflict, offline queue, WS-before-ack, session soak

Details: [`12-testing-and-performance.md`](./12-testing-and-performance.md).

### Phase 12 — Error boundaries

1. Home (dev): **Throw page render error** — header stays; page fallback; Telemetry shows `ui.error` with `source: render`
2. Home: **Fire unhandled rejection** — console + `ui.error` with `source: unhandledrejection`
3. Open an `IN_REVIEW` note → **Throw SOAP panel error** — only the SOAP card falls back
4. Same note → **Throw page error** — whole outlet fallback; navigate away or Try again

### Phase 13 — Correlation IDs

1. Open an `IN_REVIEW` note and edit SOAP — Network version POST shows `X-Correlation-Id` (e.g. `save_…`); response echoes it
2. Telemetry panel → **Last corr** updates; after flush, batch event props include the same `correlationId`
3. Transition — Network + Telemetry share a `transition_…` id; console `[log:info]` lines carry it
4. With WS connected, save again — console `realtime.echo` logs the same id on the inbound event
5. Navigate Home ↔ Notes — each route change mints a `page_…` id on `page.view` and flushes the telemetry batch (`flush("route")`)
