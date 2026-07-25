import { describe, expect, it } from "vitest";
import {
  AMEND_GRACE_MS,
  applyServerStatusChange,
  can,
  getAvailableActions,
  isContentReadOnly,
  transition,
  TRANSITIONS,
  type MachineContext,
  type NoteAction,
} from "./index";
import type { NoteStatus, Role } from "../types";

const NOW = "2025-11-04T14:41:02.000Z";
const APPROVED_RECENT = "2025-11-04T10:00:00.000Z"; // ~4.7h before NOW
const APPROVED_STALE = "2025-11-02T14:41:02.000Z"; // 48h before NOW

function actor(id: string, role: Role) {
  return { id, role };
}

function base(
  overrides: Partial<MachineContext> & Pick<MachineContext, "status">,
): MachineContext {
  return {
    assignedReviewerId: null,
    approvedAt: null,
    now: NOW,
    actor: null,
    source: "user",
    ...overrides,
  };
}

describe("transition table completeness", () => {
  it("covers every assignment edge exactly once per (action, from)", () => {
    const keys = TRANSITIONS.map((t) => `${t.action}:${t.from}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(TRANSITIONS).toHaveLength(11);
  });
});

describe("auto generation transitions", () => {
  it("GENERATING → READY_FOR_REVIEW on generation.complete", () => {
    const result = transition("generation.complete", base({ status: "GENERATING" }));
    expect(result).toMatchObject({ ok: true, to: "READY_FOR_REVIEW" });
  });

  it("GENERATING → FAILED on generation.error", () => {
    const result = transition("generation.error", base({ status: "GENERATING" }));
    expect(result).toMatchObject({ ok: true, to: "FAILED" });
  });

  it("rejects generation.complete from other statuses", () => {
    const result = can("generation.complete", base({ status: "IN_REVIEW" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("not valid from status");
    }
  });
});

describe("regenerate", () => {
  it.each(["CLINICIAN", "ADMIN"] as Role[])(
    "allows %s to regenerate from FAILED",
    (role) => {
      const result = transition(
        "regenerate",
        base({ status: "FAILED", actor: actor("u1", role) }),
      );
      expect(result).toMatchObject({ ok: true, to: "GENERATING" });
    },
  );

  it("blocks REVIEWER regenerate", () => {
    const result = can(
      "regenerate",
      base({ status: "FAILED", actor: actor("u1", "REVIEWER") }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/CLINICIAN or ADMIN/);
  });
});

describe("start_review", () => {
  it("READY_FOR_REVIEW → IN_REVIEW and assigns the reviewer", () => {
    const result = transition(
      "start_review",
      base({ status: "READY_FOR_REVIEW", actor: actor("dr_a", "REVIEWER") }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.to).toBe("IN_REVIEW");
      expect(result.effects).toContainEqual({
        type: "assign_reviewer",
        reviewerId: "dr_a",
      });
    }
  });

  it("AMENDED → IN_REVIEW for a reviewer", () => {
    const result = transition(
      "start_review",
      base({ status: "AMENDED", actor: actor("dr_b", "REVIEWER") }),
    );
    expect(result).toMatchObject({ ok: true, to: "IN_REVIEW" });
  });

  it("blocks CLINICIAN from starting review", () => {
    const result = can(
      "start_review",
      base({
        status: "READY_FOR_REVIEW",
        actor: actor("c1", "CLINICIAN"),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/REVIEWER/);
  });
});

describe("IN_REVIEW actions", () => {
  const inReview = (overrides: Partial<MachineContext> = {}) =>
    base({
      status: "IN_REVIEW",
      assignedReviewerId: "dr_a",
      actor: actor("dr_a", "REVIEWER"),
      ...overrides,
    });

  it("assigned reviewer can return → READY_FOR_REVIEW and release lock", () => {
    const result = transition("return", inReview());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.to).toBe("READY_FOR_REVIEW");
      expect(result.effects).toContainEqual({ type: "release_reviewer" });
    }
  });

  it("non-assigned reviewer cannot return", () => {
    const result = can(
      "return",
      inReview({ actor: actor("dr_b", "REVIEWER") }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("You are not the assigned reviewer");
    }
  });

  it("approve requires MFA for user source", () => {
    const denied = can("approve", inReview({ mfaVerified: false }));
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toMatch(/MFA/);

    const allowed = transition("approve", inReview({ mfaVerified: true }));
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.to).toBe("APPROVED");
      expect(allowed.effects).toContainEqual({
        type: "record_approved_at",
        at: NOW,
      });
    }
  });

  it("approve skips MFA when source is server", () => {
    const result = transition(
      "approve",
      inReview({ source: "server", mfaVerified: false }),
    );
    expect(result).toMatchObject({ ok: true, to: "APPROVED" });
  });

  it("reject requires a reason", () => {
    const denied = can("reject", inReview({ reason: "  " }));
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toMatch(/reason/);

    const allowed = transition(
      "reject",
      inReview({ reason: "missing plan" }),
    );
    expect(allowed).toMatchObject({ ok: true, to: "REJECTED" });
  });
});

describe("resubmit", () => {
  it("CLINICIAN can resubmit REJECTED → READY_FOR_REVIEW with new version effect", () => {
    const result = transition(
      "resubmit",
      base({ status: "REJECTED", actor: actor("c1", "CLINICIAN") }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.to).toBe("READY_FOR_REVIEW");
      expect(result.effects).toContainEqual({ type: "require_new_version" });
    }
  });

  it("REVIEWER cannot resubmit", () => {
    const result = can(
      "resubmit",
      base({ status: "REJECTED", actor: actor("dr_a", "REVIEWER") }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("amend and lock grace window", () => {
  it("allows CLINICIAN amend within 24h", () => {
    const result = transition(
      "amend",
      base({
        status: "APPROVED",
        approvedAt: APPROVED_RECENT,
        actor: actor("c1", "CLINICIAN"),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.to).toBe("AMENDED");
      expect(result.effects).toEqual(
        expect.arrayContaining([
          { type: "require_new_version" },
          { type: "clear_approved_at" },
        ]),
      );
    }
  });

  it("blocks amend after grace expires", () => {
    const result = can(
      "amend",
      base({
        status: "APPROVED",
        approvedAt: APPROVED_STALE,
        actor: actor("c1", "CLINICIAN"),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/24h/);
  });

  it("grace_expired locks after 24h", () => {
    const tooEarly = can(
      "grace_expired",
      base({ status: "APPROVED", approvedAt: APPROVED_RECENT }),
    );
    expect(tooEarly.ok).toBe(false);

    const locked = transition(
      "grace_expired",
      base({ status: "APPROVED", approvedAt: APPROVED_STALE }),
    );
    expect(locked).toMatchObject({ ok: true, to: "LOCKED" });
  });

  it("server can force grace_expired before window elapses", () => {
    const result = transition(
      "grace_expired",
      base({
        status: "APPROVED",
        approvedAt: APPROVED_RECENT,
        source: "server",
      }),
    );
    expect(result).toMatchObject({ ok: true, to: "LOCKED" });
  });

  it("documents grace constant as 24h", () => {
    expect(AMEND_GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("getAvailableActions", () => {
  it("derives enabled/disabled buttons for IN_REVIEW assigned reviewer", () => {
    const actions = getAvailableActions(
      base({
        status: "IN_REVIEW",
        assignedReviewerId: "dr_a",
        actor: actor("dr_a", "REVIEWER"),
        mfaVerified: true,
        reason: "x",
      }),
    );

    const byAction = Object.fromEntries(
      actions.map((a) => [a.action, a]),
    ) as Record<NoteAction, (typeof actions)[number]>;

    expect(byAction.return?.enabled).toBe(true);
    expect(byAction.approve?.enabled).toBe(true);
    expect(byAction.reject?.enabled).toBe(true);
  });

  it("disables IN_REVIEW actions for the wrong reviewer with reasons", () => {
    const actions = getAvailableActions(
      base({
        status: "IN_REVIEW",
        assignedReviewerId: "dr_a",
        actor: actor("dr_b", "REVIEWER"),
      }),
    );

    for (const action of actions) {
      expect(action.enabled).toBe(false);
      expect(action.reason).toBe("You are not the assigned reviewer");
    }
  });

  it("READONLY_AUDITOR sees all user actions disabled", () => {
    const actions = getAvailableActions(
      base({
        status: "READY_FOR_REVIEW",
        actor: actor("audit", "READONLY_AUDITOR"),
      }),
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => !a.enabled)).toBe(true);
    expect(actions[0]?.reason).toMatch(/READONLY_AUDITOR/);
  });

  it("LOCKED has no user actions", () => {
    expect(
      getAvailableActions(
        base({ status: "LOCKED", actor: actor("c1", "CLINICIAN") }),
      ),
    ).toEqual([]);
  });
});

describe("applyServerStatusChange", () => {
  it("maps READY_FOR_REVIEW → IN_REVIEW through start_review", () => {
    const result = applyServerStatusChange({
      status: "READY_FOR_REVIEW",
      to: "IN_REVIEW",
      assignedReviewerId: null,
      approvedAt: null,
      now: NOW,
      actor: actor("dr_a", "REVIEWER"),
    });
    expect(result).toMatchObject({
      ok: true,
      action: "start_review",
      to: "IN_REVIEW",
    });
  });

  it("rejects illegal server jumps", () => {
    const result = applyServerStatusChange({
      status: "GENERATING",
      to: "APPROVED",
      assignedReviewerId: null,
      approvedAt: null,
      now: NOW,
      actor: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/No legal transition/);
  });
});

describe("isContentReadOnly", () => {
  const cases: Array<[NoteStatus, boolean]> = [
    ["LOCKED", true],
    ["GENERATING", true],
    ["IN_REVIEW", false],
    ["READY_FOR_REVIEW", false],
  ];

  it.each(cases)("%s → %s", (status, expected) => {
    expect(isContentReadOnly(status)).toBe(expected);
  });
});
