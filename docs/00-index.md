# Architecture & interview docs

Separate files so each can be committed alone. Start with the learning day, then diagrams.

| File | Contents |
|---|---|
| [11-one-day-learning-roadmap.md](./11-one-day-learning-roadmap.md) | **Start here** — 8–10h plan with articles/videos |
| [01-hexagonal-architecture.md](./01-hexagonal-architecture.md) | Ports & adapters mapped to this repo |
| [02-state-layers.md](./02-state-layers.md) | URL / Zustand / Query / Dexie / domain |
| [03-note-lifecycle-state-machine.md](./03-note-lifecycle-state-machine.md) | Status graph from `TRANSITIONS` |
| [04-sequence-save-happy-path.md](./04-sequence-save-happy-path.md) | Coalesced autosave sequence |
| [05-sequence-conflict-409.md](./05-sequence-conflict-409.md) | Three-way merge on version conflict |
| [06-sequence-offline-queue.md](./06-sequence-offline-queue.md) | Dexie outbox drain |
| [07-realtime-reconcile.md](./07-realtime-reconcile.md) | WS vs HTTP race + viewport subs |
| [08-fsd-dependency-map.md](./08-fsd-dependency-map.md) | FSD layers & import rule |
| [09-adr-index.md](./09-adr-index.md) | 10 tradeoff ADRs |
| [10-interview-talk-track.md](./10-interview-talk-track.md) | 5-min tour + grill answers |

Mermaid diagrams render on GitHub and in most Markdown previews (VS Code/Cursor Markdown preview).
