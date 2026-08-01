# Realtime channel — reconciliation

The socket is a **hint channel**. Nothing arriving on it is trusted on sight: it is deduped, re-validated by the same `noteMachine` the API used, then reconciled against the local draft before any cache moves.

---

## Chart

![Realtime reconciliation](./images/realtime-reconcile.png)

---

## Two gates every frame clears

| Gate | Rule |
|---|---|
| Cursor | `lastEventId = eventId`, **durable log ids only** — presence `snap_*` ids are skipped, otherwise `eventsSince` misses and replays history as fresh events |
| Dedupe | `seenEventIds` (2 000 cap) — first sight wins, so at-least-once delivery lands exactly once |

## Reconciliation cases

| Event | Case | Outcome |
|---|---|---|
| `note.status_changed` | Cached status already equals `toStatus` | Own optimistic patch confirmed — refresh `updatedAt`, `mergeReviewEvent` swaps the `local_*` row for the server's |
| | Someone else acted | `applyServerStatusChange` validates `from → to` before the cache write |
| | Machine refuses the pushed edge | Cache untouched; detail query invalidated |
| `note.version_added` | Revision ≤ current tip | Late echo of a slow save — dropped, the cache never walks backwards |
| | Own save, HTTP ack not back yet | `acknowledgeSave` advances the base version; text typed during the POST stays dirty |
| | Foreign save, draft dirty | Three-way merge opens; editor keeps showing local text |
| | Foreign save, draft clean | Cache follows the server tip + a toast naming the author |
| `note.presence` | Always | Presence store only — deliberately outside the log, since replaying it after a reconnect would be a lie |

## Reconnect

Backoff reconnect → resubscribe carrying `lastEventId` → server `eventsSince()` returns everything after the cursor, filtered to subscribed notes (a trimmed cursor falls back to the last 200). The replay re-enters the dedupe gate, which is what makes a generous replay window free.

---

## Related code

- `apps/web/src/shared/realtime/client.ts`
- `apps/web/src/entities/note/lib/apply-realtime-event.ts`
- `apps/api/src/realtime/hub.ts`
- `apps/api/src/store/store.ts` — `emit` / `eventsSince`
