import type { UserRef } from "@soulside/domain";

/**
 * Mock directory for the take-home — mirrors users seeded by `apps/api`.
 * "Act as" mints a server JWT (`POST /api/dev/token`); the API trusts claims,
 * not `X-Actor-Id` / body.actorId. Still not a real IdP (no password).
 */
export const DEV_ACTORS: UserRef[] = [
  { id: "dr_a", displayName: "Dr. A", role: "REVIEWER" },
  { id: "dr_b", displayName: "Dr. B", role: "REVIEWER" },
  { id: "usr_clin_001", displayName: "Dr. Avery", role: "CLINICIAN" },
  { id: "usr_adm_001", displayName: "Admin Kim", role: "ADMIN" },
  { id: "usr_aud_001", displayName: "Auditor Lee", role: "READONLY_AUDITOR" },
];

/** Default before persist hydrates — first reviewer matches common lab flows. */
export const DEFAULT_ACTOR = DEV_ACTORS[0]!;
