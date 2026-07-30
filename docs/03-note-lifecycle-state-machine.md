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
| `start_review` | Role `REVIEWER` or `ADMIN`; assigns actor |
| `approve` | Assigned reviewer (MFA) or `ADMIN` override |
| `reject` | Assigned reviewer or `ADMIN`; non-empty `reason` |
| `return` | Assigned reviewer or `ADMIN` |
| `amend` | CLINICIAN/ADMIN + within 24h grace |
| `resubmit` | CLINICIAN or `ADMIN` |
| `regenerate` | CLINICIAN / ADMIN from `FAILED` → `GENERATING` (API then mock-completes to READY in 5–15s) |

UI contract: **`getAvailableActions`** drives buttons — no hardcoded status `if` trees for “what can I click.”

**Content edit vs workflow:** SOAP edits use **`canEditContent`**. Workflow transitions use guards above. **`ADMIN`** has break-glass access to all user transitions (including approve without MFA and IN_REVIEW actions when not assigned). Other reviewers remain assignment-gated for approve/reject/return.

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
