# Interview talk track + grill sheet

## 5-minute architecture tour (memorize)

1. **Problem:** Multi-reviewer clinical notes — lifecycle, conflicts, offline, live updates, scale.  
2. **Shape:** Monorepo — `packages/domain` (pure machine), `apps/api` (Hono mock), `apps/web` (FSD SPA).  
3. **State topology:** URL filters · Zustand drafts/session · Query server cache · Dexie outbox — never notes-in-Zustand.  
4. **Machine:** `TRANSITIONS` single source; UI asks `getAvailableActions`; API validates same edges.  
5. **Hard paths:** Coalesced autosave → 409 three-way merge → offline queue drain → WS reconcile with `eventId` dedupe.  
6. **Scale/obs:** Virtualized infinite list, viewport WS, telemetry redaction.  
7. **Close:** “Happy to deep-dive any of: concurrency, offline, or realtime races.”

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
100k notes can’t fan out globally. Subscribe what the virtualizer shows + open detail; replay via `lastEventId`.

**Q7. Why FSD?**  
Capability slices match phases; import rule prevents spaghetti. Cost is folders — worth it for walkthrough clarity.

**Q8. Auth is fake — what would prod add?**  
IdP/OIDC, httpOnly session, server-side capability checks (already authoritative on transitions), audit log, real MFA.

**Q9. What breaks at 100k notes / 50 reviewers?**  
Without virtualization + cursor pagination + scoped WS: DOM/memory and socket fan-out. We bounded those. Next: real DB indexes, horizontal API, backpressure.

**Q10. What did you not test?**  
Every UI permutation, visual regression, literal 20-minute CI sleep, full axe suite. Protected: machine, coalesce, queue, realtime dedupe, one e2e path.

## Demo script (10 min live)

1. Lab: seed → start review → force 409 → merge.  
2. Two tabs: Live badge + presence + status chip.  
3. DevTools Offline: edit → reload → online drain.  
4. Telemetry panel: emit sample → redacted Network payload.  
5. Act as Auditor: denied Admin/Lab with reason (not empty UI).

## Whiteboard order if asked to redesign from scratch

1. Domain statuses + transitions  
2. State topology boxes  
3. Save sequence + conflict  
4. Offline outbox  
5. Realtime reconcile  
6. Scale + telemetry footnotes
