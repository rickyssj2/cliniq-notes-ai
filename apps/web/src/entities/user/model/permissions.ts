import type { Role } from "@soulside/domain";

export type Capability =
  | "view_notes"
  | "access_review_queue"
  | "access_admin"
  | "access_api_lab"
  | "mutate_workflow"
  | "bulk_assign";

export type AccessResult = { ok: true } | { ok: false; reason: string };

const ROLE_CAPS: Record<Role, readonly Capability[]> = {
  CLINICIAN: [
    "view_notes",
    "access_api_lab",
    "mutate_workflow",
  ],
  REVIEWER: [
    "view_notes",
    "access_review_queue",
    "access_api_lab",
    "mutate_workflow",
    "bulk_assign",
  ],
  ADMIN: [
    "view_notes",
    "access_review_queue",
    "access_admin",
    "access_api_lab",
    "mutate_workflow",
    "bulk_assign",
  ],
  READONLY_AUDITOR: ["view_notes"],
};

const CAP_LABEL: Record<Capability, string> = {
  view_notes: "view notes",
  access_review_queue: "open the review queue",
  access_admin: "open admin tools",
  access_api_lab: "open the API lab",
  mutate_workflow: "change note workflow state",
  bulk_assign: "bulk-assign reviewers",
};

export function can(
  role: Role,
  capability: Capability,
): AccessResult {
  if (ROLE_CAPS[role].includes(capability)) return { ok: true };
  return {
    ok: false,
    reason: `Your role (${role}) cannot ${CAP_LABEL[capability]}`,
  };
}

export function requireCapability(
  role: Role,
  capability: Capability,
): AccessResult {
  return can(role, capability);
}
