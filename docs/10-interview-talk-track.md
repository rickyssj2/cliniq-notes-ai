# Interview talk track + grill sheet

## 5-minute architecture tour (memorize)

1. **Problem:** Multi-reviewer clinical notes — lifecycle, conflicts, offline, live updates, scale.  
2. **Shape:** Monorepo — `packages/domain` (pure machine), `apps/api` (Hono mock), `apps/web` (FSD SPA).  
3. **State topology:** URL filters · Zustand drafts/session+JWT · Query server cache · Dexie outbox — never notes-in-Zustand.  
4. **Machine:** `TRANSITIONS` single source; UI asks `getAvailableActions`; API validates same edges.  
5. **Hard paths:** Coalesced autosave → 409 three-way merge → offline queue drain → WS reconcile with `eventId` dedupe.  
6. **Auth:** Demo JWT on notes; claims override body/`X-Actor-Id`; capability matrix for UX.  
7. **Scale/obs:** Virtualized infinite list, viewport WS, telemetry batch/backoff/park + redaction.  
8. **Close:** “Happy to deep-dive any of: concurrency, offline, or realtime races.”

## 60–90s answers (grill list)

**Q1. Why pure machine instead of XState?**  
Shared SPA+API validation, zero framework, easy tests. Tradeoff: no XState viz — we ship Mermaid.

**Q2. Why TQ + Zustand?**  
Server vs client state. Notes stale/shared → Query. Drafts/actor → Zustand. Official guidance: Query does not replace client state.

**Q3. Why Dexie only for queues?**  
Outbox pattern: durable *intent*. Full offline replica is a different product (sync protocol, conflict surface).

**Q4. Why three-way merge?**  
Clinical data — LWW drops work. Ancestor + yours + server makes loss visible and resolvable.

**Q5. What does `clientMutationId` stop?**  
Duplicate versions when retrying 5xx, draining queue, or double-submits after coalesce.

**Q6. Why viewport WS subs?**  
100k notes can’t fan out globally. Subscribe what the virtualizer shows + open detail; replay via `lastEventId`. Unsubscribe ≠ presence leave.

**Q7. Why FSD?**  
Capability slices match phases; import rule prevents spaghetti. Cost is folders — worth it for walkthrough clarity.

**Q8. Auth is demo JWT — what would prod add?**  
IdP/OIDC, httpOnly session cookies, drop `/dev/token`, keep claim-driven server checks + capability matrix + audit log + real MFA. Today: Bearer required on `/api/notes/*`; forged `X-Actor-Id` alone is 401.

**Q9. What breaks at 100k notes / 50 reviewers?**  
Without virtualization + cursor pagination + scoped WS: DOM/memory and socket fan-out. We bounded those. Next: real DB indexes, horizontal API, backpressure.

**Q10. What did you not test?**  
Every UI permutation, visual regression, literal 20-minute CI sleep, full axe suite, heap profiling for 500-note sessions. Protected: machine, coalesce, optimistic transitions, queue, realtime dedupe, **11 e2e paths** (incl. two-tab conflict, offline drain, WS-before-ack, session soak).

**Q11. How do optimistic transitions roll back?**  
Patch list/detail + local ReviewEvent → POST; on non-network reject restore snapshot + toast; HTTP/WS ack reconciles local event by transition match / `eventId`. Sticky Demo fail latch makes this demoable repeatedly.

## Demo script (10 min live)

1. Demo **D**: JWT showcase (401s then 200).  
2. Start review → force 409 → merge.  
3. Sticky fail transitions + delay → optimism then rollback → Clear.  
4. Two tabs: Live badge + presence + status chip; duplicate WS eventId.  
5. DevTools Offline: edit → soft remount (← Notes / history) → online drain (hard reload offline can’t boot Vite without a SW).  
6. Telemetry panel: emit sample → redacted Network payload; Fail×3 → park → Flush.  
7. Act as Auditor: denied Admin with reason (not empty UI).

## Whiteboard order if asked to redesign from scratch

1. Domain statuses + transitions  
2. State topology boxes  
3. Save sequence + conflict  
4. Offline outbox  
5. Realtime reconcile  
6. Auth claims vs UX guards  
7. Scale + telemetry footnotes
