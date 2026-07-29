# Sequence — version conflict (409) three-way merge

Optimistic concurrency: `POST .../versions` requires `baseVersionId`. Mismatch → `409 version_conflict` with `current` + `commonAncestor` content.

## Diagram

```mermaid
sequenceDiagram
  actor User
  participant Saver as autosave / Save now
  participant TQ as TanStack Query
  participant API as POST /versions
  participant Modal as ConflictMergeModal

  User->>Saver: edit (stale baseVersionId)
  Saver->>TQ: optimistic patch
  Saver->>API: baseVersionId=A, clientMutationId=M
  API-->>Saver: 409 + current(B) + commonAncestor
  Saver->>TQ: rollback optimistic snapshot
  Saver->>Modal: open three-way<br/>ancestor / yours / server (word diff)
  User->>Modal: pick sections → Resolve & save
  Modal->>API: baseVersionId=B (server head), new clientMutationId
  API-->>Modal: 200
  Modal->>TQ: apply resolved note
```

## Why three-way (not LWW / silent overwrite)

| Strategy | Risk in clinical notes |
|---|---|
| Last-write-wins | Silently drops another reviewer’s SOAP edits |
| Auto text merge | Unsafe without domain-aware merge |
| **Three-way + human resolve** | Preserves both intents; ancestor anchors the diff |

## Idempotency

- Retry after **5xx** reuses the same `clientMutationId`.
- Resolve after **409** retargets `baseVersionId` to server head and typically uses a **new** mutation id for the merge save (`merge_…`).

## Related code

- `apps/web/src/features/resolve-conflict/`
- `apps/web/src/shared/ui/word-diff.tsx`
- API `X-Force-Conflict` / chaos for demos
