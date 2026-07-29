# Sequence — online coalesced autosave (happy path)

Phase 6: draft → coalesce → optimistic Query patch → POST → ack.

## Diagram

```mermaid
sequenceDiagram
  actor User
  participant Editor as SOAP editor<br/>(Zustand draft)
  participant Saver as coalesced autosave
  participant TQ as TanStack Query
  participant API as POST /notes/:id/versions

  User->>Editor: type in section
  Editor->>Editor: mark dirty + schedule (~800ms)
  Note over Saver: Rapid keystrokes coalesce<br/>at most one in-flight + one follow-up
  Saver->>TQ: optimistic patch detail (+ list updatedAt)
  Saver->>API: content, baseVersionId, clientMutationId
  API-->>Saver: 200 + new version / revision
  Saver->>TQ: reconcile with server note
  Saver->>Editor: markClean (clear dirty badges)
```

## Design notes

- **Mutations never auto-retry** (`query-client.ts`) — callers own idempotency via `clientMutationId` and the offline queue. Blind retries would race coalesced saves.
- Optimistic paint makes typing feel instant; **500** restores the TQ snapshot and surfaces Retry with the **same** mutation id.
- Dirty badges / “Saving…” / “Saved” are derived from draft + in-flight state, not from inventing a second note model.

## Related code

- `apps/web/src/features/autosave-note/model/coalesced-saver.ts`
- `apps/web/src/features/autosave-note/model/use-coalesced-autosave.ts`
