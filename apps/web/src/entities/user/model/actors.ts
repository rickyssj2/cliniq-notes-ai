import type { UserRef } from "@soulside/domain";

/**
 * Mock directory for the take-home — mirrors users seeded by `apps/api`.
 * Not production auth: there is no IdP in this assignment. The header
 * "Act as" switcher picks from this list so we can exercise role guards.
 *
 * When real auth lands, replace this with the identity from the session
 * token / `/me` endpoint; keep `permissions.ts` as the capability matrix.
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
