# Architecture docs


| File                                                                       | Contents                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| [01-hexagonal-architecture.md](./01-hexagonal-architecture.md)             | Ports & adapters (honest: hexagonal **core**)  |
| [02-state-layers.md](./02-state-layers.md)                                 | URL / Zustand / Query / Dexie / domain         |
| [03-note-lifecycle-state-machine.md](./03-note-lifecycle-state-machine.md) | Status graph from `TRANSITIONS`                |
| [04-sequence-save-happy-path.md](./04-sequence-save-happy-path.md)         | Coalesced autosave                             |
| [05-sequence-conflict-409.md](./05-sequence-conflict-409.md)               | Three-way merge on 409                         |
| [06-sequence-offline-queue.md](./06-sequence-offline-queue.md)             | Dexie outbox drain                             |
| [07-fsd-dependency-map.md](./07-fsd-dependency-map.md)                     | FSD layers & import rule                       |
| [08-adr-index.md](./08-adr-index.md)                                       | 11 tradeoff ADRs (incl. demo JWT, sticky fail) |




### Images

```
docs/images/
  hexagonal-architecture.png
  sequence-conflict-409.png
  sequence-offline.png
```

