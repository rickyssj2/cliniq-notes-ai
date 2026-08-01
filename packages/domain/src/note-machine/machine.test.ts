import { describe, expect, it } from "vitest";
import {
  AMEND_GRACE_MS,
  applyTransition,
  can,
  canTransitionTo,
  getAvailableActions,
  isContentReadOnly,
  canEditContent,
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
    const result = can("generation.complete", base({ status: "GENERATING" }));
    expect(result).toMatchObject({ ok: true, to: "READY_FOR_REVIEW" });
  });

  it("GENERATING → FAILED on generation.error", () => {
    const result = can("generation.error", base({ status: "GENERATING" }));
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
      const result = can(
        "regenerate",
        base({ status: "FAILED", actor: actor("u1", role) }),
      );
      expect(result).toMatchObject({ ok: true, to: "GENERATING" });
    },
  );

  it("blocks REVIEWER regenerate", () => {
    const result = can(
      "regenerate",
      base({ status: "FAILED", actor: actor("dr_a", "REVIEWER") }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/CLINICIAN or ADMIN/);
  });

  it("blocks READONLY_AUDITOR regenerate", () => {
    const result = can(
      "regenerate",
      base({ status: "FAILED", actor: actor("u1", "READONLY_AUDITOR") }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/READONLY_AUDITOR/);
  });
});

describe("start_review", () => {
  it("READY_FOR_REVIEW → IN_REVIEW and assigns the reviewer", () => {
    const result = can(
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
    const result = can(
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

  it("allows ADMIN to start review and self-assign", () => {
    const result = can(
      "start_review",
      base({ status: "READY_FOR_REVIEW", actor: actor("adm", "ADMIN") }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.to).toBe("IN_REVIEW");
      expect(result.effects).toContainEqual({
        type: "assign_reviewer",
        reviewerId: "adm",
      });
    }
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
    const result = can("return", inReview());
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

    const allowed = can("approve", inReview({ mfaVerified: true }));
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.to).toBe("APPROVED");
      expect(allowed.effects).toContainEqual({
        type: "record_approved_at",
        at: NOW,
      });
    }
  });

  it("approve skips MFA when the transition was already decided", () => {
    const result = can(
      "approve",
      inReview({ source: "system", mfaVerified: false }),
    );
    expect(result).toMatchObject({ ok: true, to: "APPROVED" });
  });

  it("reject requires a reason", () => {
    const denied = can("reject", inReview({ reason: "  " }));
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toMatch(/reason/);

    const allowed = can(
      "reject",
      inReview({ reason: "missing plan" }),
    );
    expect(allowed).toMatchObject({ ok: true, to: "REJECTED" });
  });

  it("ADMIN can return, approve, and reject without being assigned", () => {
    const ctx = inReview({ actor: actor("adm", "ADMIN"), mfaVerified: false });
    expect(can("return", ctx)).toMatchObject({
      ok: true,
      to: "READY_FOR_REVIEW",
    });
    expect(can("approve", ctx)).toMatchObject({
      ok: true,
      to: "APPROVED",
    });
    expect(
      can("reject", { ...ctx, reason: "admin override" }),
    ).toMatchObject({ ok: true, to: "REJECTED" });
  });
});

describe("resubmit", () => {
  it("CLINICIAN can resubmit REJECTED → READY_FOR_REVIEW with new version effect", () => {
    const result = can(
      "resubmit",
      base({ status: "REJECTED", actor: actor("c1", "CLINICIAN") }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.to).toBe("READY_FOR_REVIEW");
      expect(result.effects).toContainEqual({ type: "require_new_version" });
    }
  });

  it("ADMIN can resubmit REJECTED → READY_FOR_REVIEW", () => {
    const result = can(
      "resubmit",
      base({ status: "REJECTED", actor: actor("adm", "ADMIN") }),
    );
    expect(result).toMatchObject({ ok: true, to: "READY_FOR_REVIEW" });
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
    const result = can(
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

    const locked = can(
      "grace_expired",
      base({ status: "APPROVED", approvedAt: APPROVED_STALE }),
    );
    expect(locked).toMatchObject({ ok: true, to: "LOCKED" });
  });

  it("an already-decided lock is accepted before the window elapses", () => {
    const result = can(
      "grace_expired",
      base({
        status: "APPROVED",
        approvedAt: APPROVED_RECENT,
        source: "system",
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

  it("enables IN_REVIEW actions for ADMIN even when not assigned", () => {
    const actions = getAvailableActions(
      base({
        status: "IN_REVIEW",
        assignedReviewerId: "dr_a",
        actor: actor("adm", "ADMIN"),
        mfaVerified: false,
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

describe("canTransitionTo", () => {
  it("maps READY_FOR_REVIEW → IN_REVIEW through start_review", () => {
    const result = canTransitionTo("IN_REVIEW", {
      status: "READY_FOR_REVIEW",
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

  it("rejects illegal jumps", () => {
    const result = canTransitionTo("APPROVED", {
      status: "GENERATING",
      assignedReviewerId: null,
      approvedAt: null,
      now: NOW,
      actor: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/No legal transition/);
  });

  it("leaves the intent gates to the caller's declared source", () => {
    const ctx = {
      status: "IN_REVIEW" as const,
      assignedReviewerId: "dr_a",
      approvedAt: null,
      now: NOW,
      actor: actor("dr_a", "REVIEWER"),
    };

    // Observing a change that already happened: MFA was proven elsewhere.
    expect(canTransitionTo("APPROVED", { ...ctx, source: "system" })).toMatchObject({
      ok: true,
      to: "APPROVED",
    });

    // Asking for the same change here still has to prove it.
    const asUser = canTransitionTo("APPROVED", { ...ctx, source: "user" });
    expect(asUser.ok).toBe(false);
    if (!asUser.ok) expect(asUser.reason).toMatch(/MFA/);
  });
});

describe("applyTransition", () => {
  const fresh = {
    status: "READY_FOR_REVIEW" as const,
    assignedReviewerId: null,
    approvedAt: null,
  };

  function decide(
    action: NoteAction,
    ctx: Partial<MachineContext> & Pick<MachineContext, "status">,
  ) {
    const result = can(action, base(ctx));
    if (!result.ok) throw new Error(`expected ${action} to be allowed`);
    return result;
  }

  it("assigns the acting reviewer on start_review", () => {
    const result = decide("start_review", {
      status: "READY_FOR_REVIEW",
      actor: actor("dr_a", "REVIEWER"),
    });
    expect(applyTransition(fresh, result)).toEqual({
      status: "IN_REVIEW",
      assignedReviewerId: "dr_a",
      approvedAt: null,
      requiresNewVersion: false,
    });
  });

  it("stamps approvedAt and releases the reviewer on approve", () => {
    const result = decide("approve", {
      status: "IN_REVIEW",
      assignedReviewerId: "dr_a",
      actor: actor("dr_a", "REVIEWER"),
      mfaVerified: true,
    });
    expect(
      applyTransition(
        { status: "IN_REVIEW", assignedReviewerId: "dr_a", approvedAt: null },
        result,
      ),
    ).toEqual({
      status: "APPROVED",
      assignedReviewerId: null,
      approvedAt: NOW,
      requiresNewVersion: false,
    });
  });

  it("clears approvedAt and demands a new version on amend", () => {
    const result = decide("amend", {
      status: "APPROVED",
      approvedAt: APPROVED_RECENT,
      actor: actor("dr_c", "CLINICIAN"),
    });
    expect(
      applyTransition(
        {
          status: "APPROVED",
          assignedReviewerId: null,
          approvedAt: APPROVED_RECENT,
        },
        result,
      ),
    ).toEqual({
      status: "AMENDED",
      assignedReviewerId: null,
      approvedAt: null,
      requiresNewVersion: true,
    });
  });

  it("leaves untouched fields alone", () => {
    const result = decide("regenerate", {
      status: "FAILED",
      actor: actor("dr_c", "CLINICIAN"),
    });
    expect(
      applyTransition(
        { status: "FAILED", assignedReviewerId: "dr_a", approvedAt: NOW },
        result,
      ),
    ).toEqual({
      status: "GENERATING",
      assignedReviewerId: "dr_a",
      approvedAt: NOW,
      requiresNewVersion: false,
    });
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

describe("canEditContent", () => {
  const assigned = { id: "usr_rev_001", role: "REVIEWER" as const };
  const otherReviewer = { id: "usr_rev_002", role: "REVIEWER" as const };
  const admin = { id: "usr_adm_001", role: "ADMIN" as const };
  const clinician = { id: "usr_clin_001", role: "CLINICIAN" as const };

  it("allows assigned reviewer and admin while IN_REVIEW", () => {
    expect(
      canEditContent({
        status: "IN_REVIEW",
        assignedReviewerId: assigned.id,
        actor: assigned,
      }).ok,
    ).toBe(true);
    expect(
      canEditContent({
        status: "IN_REVIEW",
        assignedReviewerId: assigned.id,
        actor: admin,
      }).ok,
    ).toBe(true);
    const blocked = canEditContent({
      status: "IN_REVIEW",
      assignedReviewerId: assigned.id,
      actor: otherReviewer,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toMatch(/assigned reviewer or an admin/i);
    }
  });

  it("blocks SOAP edits on READY_FOR_REVIEW until claimed", () => {
    const result = canEditContent({
      status: "READY_FOR_REVIEW",
      assignedReviewerId: null,
      actor: assigned,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Start review/i);
  });

  it("allows clinician to edit REJECTED / AMENDED", () => {
    expect(
      canEditContent({
        status: "REJECTED",
        assignedReviewerId: null,
        actor: clinician,
      }).ok,
    ).toBe(true);
    expect(
      canEditContent({
        status: "AMENDED",
        assignedReviewerId: null,
        actor: clinician,
      }).ok,
    ).toBe(true);
    expect(
      canEditContent({
        status: "REJECTED",
        assignedReviewerId: null,
        actor: assigned,
      }).ok,
    ).toBe(false);
  });

  it("blocks APPROVED and FAILED content edits", () => {
    expect(
      canEditContent({
        status: "APPROVED",
        assignedReviewerId: null,
        actor: clinician,
      }).ok,
    ).toBe(false);
    expect(
      canEditContent({
        status: "FAILED",
        assignedReviewerId: null,
        actor: clinician,
      }).ok,
    ).toBe(false);
  });
});
