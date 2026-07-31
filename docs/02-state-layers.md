# State layers — where each kind of state lives

Server state in TanStack Query, Client State in Zustand. Dexie is **not** a notes cache — only durable *client intent*.


---

## Decision table

| Data | Store | Why |
|---|---|---|
| Note list / detail / versions | TanStack Query | Shared server ownership |
| Actor / “Act as” + accessToken | Zustand + persist | Session UX; Bearer from `POST /api/dev/token` |
| Dirty SOAP draft | Zustand | Local typing before POST |
| List filters | URL | Deep-linkable |
| Pending offline save | Dexie `mutationQueue` | Survives reload |
| Parked telemetry | Dexie `telemetryPark` | Survive failed flushes |
| Legal transitions | `noteMachine` | Single source of truth |
| SOAP edit eligibility | `canEditContent` | Assigned reviewer + ADMIN in `IN_REVIEW`; clinician on reject/amend |
| Workflow transitions | `noteMachine` guards | ADMIN: all user actions; reviewers: assignment-gated in `IN_REVIEW` |


## Related code

- `apps/web/src/shared/api/query-client.ts`
- `apps/web/src/features/offline-queue/`
- `apps/web/src/features/autosave-note/`
