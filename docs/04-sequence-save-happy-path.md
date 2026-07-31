# Sequence — online coalesced autosave (happy path)

---

## Mermaid

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
