# State layers — where each kind of state lives

Server entities do **not** live in Zustand. Dexie is **not** a notes cache — only durable *client intent*.

## Diagram

```mermaid
flowchart TB
  subgraph ephemeral [Ephemeral / navigational]
    URL["URL search params<br/>filters · sort · search"]
  end

  subgraph client [Client UI state — Zustand]
    ZS["session/actor · SOAP drafts · selection<br/>presence · conflict modal · connectivity"]
  end

  subgraph serverCache [Server cache — TanStack Query]
    TQ["notes list/detail/versions<br/>optimistic patches · WS reconcile<br/>gcTime 35m · offlineFirst"]
  end

  subgraph durableIntent [Durable client intent — Dexie]
    MQ["mutationQueue<br/>create_version / transition"]
    TP["telemetryPark<br/>failed batches after 3 retries"]
  end

  subgraph domain [Pure domain — packages/domain]
    SM["noteMachine — no React, no I/O"]
  end

  subgraph wire [Wire]
    REST[REST]
    WS[WebSocket]
  end

  URL --> TQ
  ZS -->|"draft content / dirty"| TQ
  ZS -->|"can / getAvailableActions"| SM
  TQ --> REST
  MQ -->|"drain on reconnect"| REST
  TP -->|"replay flush"| REST
  WS -->|"status_changed / version_added"| TQ
  WS -->|"dirty + foreign version → merge"| ZS
```

## Decision table

| Data | Store | Why |
|---|---|---|
| Note list / detail / versions | TanStack Query | Shared server ownership; stale, refetch, optimistic patch |
| Actor / “Act as” | Zustand + persist | Session UX; not authoritative auth |
| Dirty SOAP draft | Zustand | Local typing; coalesced before POST |
| List filters | URL | Shareable / deep-linkable |
| Pending save while offline | Dexie `mutationQueue` | Survives reload; outbox pattern |
| Parked telemetry | Dexie `telemetryPark` | Survive failed flushes |
| Legal transitions | `noteMachine` | Single source of truth |

## Anti-patterns we avoided

1. Putting full `Note` entities in Zustand (duplicates TQ, fights WS updates).
2. Using Dexie as an offline mirror of all notes (huge sync surface; take-home uses queue-only).
3. Encoding status `if` trees in UI components (machine owns edges).

## Related code

- `apps/web/src/shared/api/query-client.ts` — `gcTime: 35m`, mutations `retry: false`
- `apps/web/src/features/offline-queue/`
- `apps/web/src/features/edit-soap/` + `autosave-note/`
