# Hexagonal architecture (ports & adapters)

Maps this repo onto hexagonal / ports-adapters thinking. The goal of the diagram: **domain stays pure; React, HTTP, WS, and Dexie are replaceable adapters.**

## Diagram

```mermaid
flowchart TB
  subgraph driving [Driving adapters — call into the domain]
    UI[React UI<br/>pages / widgets / features]
    Lab[API Lab / simulate_workflow]
  end

  subgraph portsIn [Inbound ports — intents]
    Actions["NoteAction<br/>start_review / approve / …"]
    Can["can / transition / getAvailableActions"]
  end

  subgraph core [Domain core — packages/domain]
    SM[noteMachine<br/>TRANSITIONS + guards + effects]
    Types[Note / SoapContent / Role types]
  end

  subgraph portsOut [Outbound ports — side effects declared, not executed]
    Effects["TransitionEffect<br/>assign_reviewer / require_new_version / …"]
  end

  subgraph driven [Driven adapters — talk to the outside]
    REST[Hono REST /api]
    WS[WebSocket /ws]
    TQ[TanStack Query cache]
    DX[Dexie mutationQueue / telemetryPark]
    Tel[Telemetry batcher]
  end

  UI --> Actions
  Lab --> Actions
  Actions --> Can
  Can --> SM
  SM --> Types
  SM --> Effects
  Effects --> REST
  UI --> TQ
  UI --> DX
  TQ --> REST
  UI --> WS
  REST --> SM
  WS --> TQ
  Tel --> REST
  Tel --> DX
```

## How to read it in this codebase

| Hexagon idea | Soulside mapping |
|---|---|
| **Core** | `packages/domain` — no React, no `fetch`, no IndexedDB |
| **Inbound port** | `can` / `transition` / `getAvailableActions` — UI asks “may I?” before POST |
| **Outbound effects** | `TransitionEffect[]` — domain *declares* assign/release; API *applies* them |
| **Driving adapter** | Action bar, bulk bar, Lab, simulation script |
| **Driven adapter** | `shared/api`, `shared/realtime`, Dexie queues, telemetry |

## Interview one-liner

> We kept clinical lifecycle invariants in a pure module so both the SPA and the mock API validate the same edges. UI and storage are adapters; they must not invent status rules.

## Related code

- `packages/domain/src/note-machine/`
- `apps/web/src/features/transition-note/`
- `apps/api` transition handlers (server also consults the machine)
