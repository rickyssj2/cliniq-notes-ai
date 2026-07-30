# Architecture & interview docs

Each architecture doc includes **three** diagram styles so you can pick one:

1. **LucidChart-style** — PNG under `docs/images/`
2. **ASCII blocks** — copy/paste friendly in terminal / plain markdown
3. **Mermaid** — optional; renders on GitHub / many Markdown previews

| File | Contents |
|---|---|
| [11-one-day-learning-roadmap.md](./11-one-day-learning-roadmap.md) | **Start here** — 8–10h plan with articles/videos |
| [01-hexagonal-architecture.md](./01-hexagonal-architecture.md) | Ports & adapters (honest: hexagonal **core**) |
| [02-state-layers.md](./02-state-layers.md) | URL / Zustand / Query / Dexie / domain |
| [03-note-lifecycle-state-machine.md](./03-note-lifecycle-state-machine.md) | Status graph from `TRANSITIONS` |
| [04-sequence-save-happy-path.md](./04-sequence-save-happy-path.md) | Coalesced autosave |
| [05-sequence-conflict-409.md](./05-sequence-conflict-409.md) | Three-way merge on 409 |
| [06-sequence-offline-queue.md](./06-sequence-offline-queue.md) | Dexie outbox drain |
| [07-realtime-reconcile.md](./07-realtime-reconcile.md) | WS vs HTTP race |
| [08-fsd-dependency-map.md](./08-fsd-dependency-map.md) | FSD layers & import rule |
| [09-adr-index.md](./09-adr-index.md) | 10 tradeoff ADRs |
| [10-interview-talk-track.md](./10-interview-talk-track.md) | 5-min tour + grill answers |
| [12-testing-and-performance.md](./12-testing-and-performance.md) | Test pyramid, sim scenarios, perf posture |

### Images

```
docs/images/
  hexagonal-architecture.png
  state-layers.png
  note-lifecycle.png
  sequence-save-happy.png
  sequence-conflict-409.png
  sequence-offline.png
  realtime-reconcile.png
  fsd-layers.png
```
