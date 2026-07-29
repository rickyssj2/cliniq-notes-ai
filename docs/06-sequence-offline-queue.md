# Sequence — offline mutation outbox (Dexie)

Phase 8: while offline, intents enqueue to IndexedDB; on reconnect, drain FIFO. Dexie holds **client intent**, not a full notes replica.

## Diagram

```mermaid
sequenceDiagram
  actor User
  participant Editor as SOAP draft
  participant Saver as autosave
  participant DX as Dexie mutationQueue
  participant TQ as TanStack Query
  participant API as REST

  User->>Editor: edit while offline
  Saver->>DX: enqueue create_version<br/>(coalesce per note)
  Saver->>Editor: markClean locally<br/>(intent durable in Dexie)
  Note over TQ: Cached list/detail still readable<br/>(gcTime 35m). Uncached → offline message.

  User->>User: reload (still offline)
  DX-->>Editor: rehydrate pending SOAP

  User->>User: back online
  DX->>API: drain orderBy(createdAt)
  alt 200
    API-->>DX: ack → remove row
    DX->>TQ: patch note
  else 409
    API-->>DX: conflict payload
    DX->>User: same three-way merge UI
  else 5xx
    API-->>DX: keep row / retry later
  end
```

## Rules of the queue

1. **Coalesce** pending `create_version` rows per note so rapid offline typing does not enqueue N near-duplicates.
2. **Transitions** (`start_review`, etc.) are also queueable intents.
3. Connectivity banner + header badge follow `navigator.onLine`; WS disconnects while offline.
4. Production hardening called out in README: queue may hold clinical text — encrypt-at-rest in real deployments.

## Related code

- `apps/web/src/features/offline-queue/model/mutation-queue.ts`
- `apps/web/src/features/offline-queue/model/drain.ts`
- `apps/web/src/shared/db/`
