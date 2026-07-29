# Note lifecycle state machine

Source of truth: `packages/domain/src/note-machine/transitions.ts` (`TRANSITIONS`, 11 edges).

## Status diagram

```mermaid
stateDiagram-v2
  [*] --> GENERATING

  GENERATING --> READY_FOR_REVIEW: generation.complete (auto)
  GENERATING --> FAILED: generation.error (auto)
  FAILED --> GENERATING: regenerate<br/>CLINICIAN/ADMIN

  READY_FOR_REVIEW --> IN_REVIEW: start_review<br/>REVIEWER → assign
  IN_REVIEW --> READY_FOR_REVIEW: return<br/>assigned reviewer
  IN_REVIEW --> APPROVED: approve<br/>assigned + MFA (user)
  IN_REVIEW --> REJECTED: reject<br/>assigned + reason

  REJECTED --> READY_FOR_REVIEW: resubmit<br/>CLINICIAN → new version

  APPROVED --> AMENDED: amend<br/>CLINICIAN/ADMIN within 24h
  APPROVED --> LOCKED: grace_expired (auto)

  AMENDED --> IN_REVIEW: start_review<br/>REVIEWER → assign

  LOCKED --> [*]
```

## Guard highlights (say these in interview)

| Action | Key guards |
|---|---|
| `start_review` | Role `REVIEWER`; assigns actor as reviewer |
| `approve` | Assigned reviewer; user path requires `mfaVerified` (server source trusts MFA) |
| `reject` | Assigned reviewer + non-empty `reason` |
| `amend` | CLINICIAN/ADMIN + within `AMEND_GRACE_MS` (24h) |
| `grace_expired` | Auto lock after grace; server may force |

## UI contract

- **`getAvailableActions`** drives the action bar — disabled buttons carry human-readable `reason`.
- **`applyServerStatusChange`** routes WS/HTTP authoritative status through the same table with `source: "server"`.
- UI must not hard-code status branches for “what buttons exist.”

## Related code

- `packages/domain/src/note-machine/machine.ts`
- `packages/domain/src/note-machine/transitions.ts`
- `apps/web/src/features/transition-note/ui/NoteActionBar.tsx`
