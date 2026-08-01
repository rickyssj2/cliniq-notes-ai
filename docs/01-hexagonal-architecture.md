# Hexagonal architecture (ports & adapters)

**Honest take:** we use hexagonal **principles on the clinical lifecycle core**, not a textbook hexagon for the entire SPA.

| Hexagonal rule | Here? |
|---|---|
| Domain has no UI / DB / HTTP | **Yes** — `packages/domain` |
| Outside enters via a port | **Yes** — `can` / `getAvailableActions` / `applyServerStatusChange` |
| UI and API share the same core | **Yes** |
| Formal outbound Port interfaces (`NoteRepository`) | **No** — the core returns `TransitionEffect[]`; both adapters apply them (functional core / imperative shell) |
| Every feature (list, WS, telemetry) is hexagonal | **No** — FSD + Query/Zustand around the core |

*“Hexagonal core for note lifecycle; the rest is FSD + state topology.”*

---


![Hexagonal core — Soulside](./images/hexagonal-architecture.png)


## Code map

| Hexagon idea | Path |
|---|---|
| Core (pure rules, no I/O) | `packages/domain/src/note-machine/` |
| Driving adapter — UI | `apps/web/src/features/transition-note/` |
| Driving adapter — API | `apps/api` store + REST/WS |
| Driven ports | **None** — the core never calls out; it returns `TransitionEffect[]` and the caller applies them |
