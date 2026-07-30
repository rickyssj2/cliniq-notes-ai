# Sequence — online coalesced autosave (happy path)

Phase 6: draft → coalesce → optimistic Query patch → POST → ack.

Pick the diagram style you prefer (image / ASCII / Mermaid).

---

## LucidChart-style

![Online autosave happy path](./images/sequence-save-happy.png)

---

## ASCII blocks

```
[ User types ] → [ Zustand draft dirty ]
        → [ coalesced autosave ~800ms ]
        → [ optimistic TanStack Query patch ]
        → [ POST /notes/:id/versions
              content + baseVersionId + clientMutationId ]
        → [ 200 OK ] → [ markClean / clear dirty badges ]
```

**Notes**

- Mutations never auto-retry — idempotency via `clientMutationId` + offline queue.
- On **500**: restore Query snapshot; Retry reuses the **same** mutation id.

---

## Mermaid (optional)

```mermaid
sequenceDiagram
  actor User
  participant Editor as Zustand draft
  participant Saver as coalesced autosave
  participant TQ as TanStack Query
  participant API as POST /versions
  User->>Editor: type
  Editor->>Saver: schedule coalesce
  Saver->>TQ: optimistic patch
  Saver->>API: baseVersionId + clientMutationId
  API-->>Saver: 200
  Saver->>Editor: markClean
```

---

## Related code

- `apps/web/src/features/autosave-note/model/coalesced-saver.ts`
- `apps/web/src/features/autosave-note/model/use-coalesced-autosave.ts`
