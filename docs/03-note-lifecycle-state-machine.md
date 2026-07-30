# Note lifecycle state machine

Source of truth: `packages/domain/src/note-machine/transitions.ts` (`TRANSITIONS`, 11 edges).

Pick the diagram style you prefer (image / ASCII / Mermaid).

---

## LucidChart-style

![Note lifecycle state machine](./images/note-lifecycle.png)

---

## ASCII blocks

```
  GENERATING ──generation.complete──► READY_FOR_REVIEW ──start_review──► IN_REVIEW
       │                                      ▲                              │
       │ generation.error                     │ return                       │
       ▼                                      │                              ├─approve──► APPROVED ──grace_expired──► LOCKED
    FAILED ──regenerate──► GENERATING         │                              │                │
                                              │                              └─reject──► REJECTED
                                              │                                              │
                                              └──────────── resubmit ◄───────────────────────┘
                                                                    (CLINICIAN)

  APPROVED ──amend (24h)──► AMENDED ──start_review──► IN_REVIEW
```

---

## Guard highlights

| Action | Key guards |
|---|---|
| `start_review` | Role `REVIEWER`; assigns actor |
| `approve` | Assigned reviewer; user path needs `mfaVerified` |
| `reject` | Assigned + non-empty `reason` |
| `amend` | CLINICIAN/ADMIN + within 24h grace |
| `grace_expired` | Auto lock after grace |

UI contract: **`getAvailableActions`** drives buttons — no hardcoded status `if` trees for “what can I click.”

---

## Mermaid (optional)

```mermaid
stateDiagram-v2
  [*] --> GENERATING
  GENERATING --> READY_FOR_REVIEW: generation.complete
  GENERATING --> FAILED: generation.error
  FAILED --> GENERATING: regenerate
  READY_FOR_REVIEW --> IN_REVIEW: start_review
  IN_REVIEW --> READY_FOR_REVIEW: return
  IN_REVIEW --> APPROVED: approve
  IN_REVIEW --> REJECTED: reject
  REJECTED --> READY_FOR_REVIEW: resubmit
  APPROVED --> AMENDED: amend
  APPROVED --> LOCKED: grace_expired
  AMENDED --> IN_REVIEW: start_review
```

---

## Related code

- `packages/domain/src/note-machine/machine.ts`
- `packages/domain/src/note-machine/transitions.ts`
- `apps/web/src/features/transition-note/ui/NoteActionBar.tsx`
