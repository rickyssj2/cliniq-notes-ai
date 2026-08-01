# Architecture docs


| File                                                                       | Contents                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| [01-hexagonal-architecture.md](./01-hexagonal-architecture.md)             | Ports & adapters (honest: hexagonal **core**)  |
| [02-state-layers.md](./02-state-layers.md)                                 | URL / Zustand / Query / Dexie / domain         |
| [03-note-lifecycle-state-machine.md](./03-note-lifecycle-state-machine.md) | Status graph from `TRANSITIONS` + effect flow  |
| [04-sequence-save-happy-path.md](./04-sequence-save-happy-path.md)         | Coalesced autosave                             |
| [05-sequence-conflict-409.md](./05-sequence-conflict-409.md)               | Three-way merge on 409                         |
| [06-sequence-offline-queue.md](./06-sequence-offline-queue.md)             | Dexie outbox drain                             |
| [07-realtime-reconcile.md](./07-realtime-reconcile.md)                     | WS dedupe, replay cursor, draft reconciliation |
| [08-fsd-dependency-map.md](./08-fsd-dependency-map.md)                     | FSD layers & import rule                       |
| [09-adr-index.md](./09-adr-index.md)                                       | 11 tradeoff ADRs (incl. demo JWT, effect folding) |




### Images

```
docs/images/
  hexagonal-architecture.png
  state-layers.png
  effect-flow.png
  realtime-reconcile.png
  sequence-conflict-409.png
  sequence-offline.png
```

Sources for the first four live in `docs/diagrams/` (HTML + CSS). Regenerate with:

```bash
node docs/diagrams/render.mjs                 # all
node docs/diagrams/render.mjs effect-flow     # one
```
