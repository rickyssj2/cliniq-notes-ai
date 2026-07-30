# State layers — where each kind of state lives

Server entities do **not** live in Zustand. Dexie is **not** a notes cache — only durable *client intent*.

The four layers you named (Zustand / TanStack Query / Dexie / URL) are the primary stores. Also in the picture: **pure `noteMachine`**, **telemetry in-memory buffer**, and **WebSocket presence/cursor**.

## Diagram

```mermaid
flowchart TB
  subgraph navigational [Navigational]
    URL["URL search params<br/>filters · sort · search · note id"]
  end

  subgraph syncClient [Sync client UI — Zustand]
    ZS["session/actor · SOAP drafts · selection<br/>presence snapshot · conflict modal · connectivity"]
  end

  subgraph asyncServer [Async server cache — TanStack Query]
    TQ["notes list / detail / versions<br/>optimistic patches · WS reconcile<br/>gcTime 35m · offline-first reads"]
  end

  subgraph durableIntent [Durable client intent — Dexie]
    MQ["mutationQueue<br/>create_version / transition"]
    TP["telemetryPark<br/>failed batches after retries"]
  end

  subgraph ephemeralWire [Ephemeral / wire]
    BUF["Telemetry in-memory buffer"]
    WS["WebSocket cursor + presence"]
  end

  subgraph domain [Pure domain — packages/domain]
    SM["noteMachine — no React, no I/O"]
  end

  URL -->|"query key inputs"| TQ
  ZS -->|"draft / dirty"| TQ
  ZS -->|"can / getAvailableActions"| SM
  TQ --> REST[REST]
  MQ -->|"drain on online"| REST
  BUF -->|"flush"| REST
  BUF -.->|"park after N fails"| TP
  TP -->|"replay on online / flush"| REST
  WS -->|"status / version / presence"| TQ
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
| Parked telemetry | Dexie `telemetryPark` | Survive failed flushes; drain on `online` |
| Legal transitions | `noteMachine` | Single source of truth |
| Live presence / WS cursor | Zustand snapshot + WS client | Ephemeral fan-in into Query |

## Anti-patterns we avoided

1. Putting full `Note` entities in Zustand (duplicates TQ, fights WS updates).
2. Using Dexie as an offline mirror of all notes (huge sync surface; take-home uses queue-only).
3. Encoding status `if` trees in UI components (machine owns edges).

## Related code

- `apps/web/src/shared/api/query-client.ts` — `gcTime: 35m`, mutations `retry: false`
- `apps/web/src/features/offline-queue/`
- `apps/web/src/features/edit-soap/` + `autosave-note/`
- `apps/web/src/shared/telemetry/client.ts`
