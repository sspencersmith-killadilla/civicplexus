import { describe, it, expect } from "vitest";
import {
  resolveApprovalChain,
  computeApplyPatch,
  computeApplySideEffects,
  DEFAULT_CHAINS_BY_ACTION,
} from "@/lib/paf-logic";

const MGR = "11111111-1111-1111-1111-111111111111";
const HR = "22222222-2222-2222-2222-222222222222";
const FALLBACK = "33333333-3333-3333-3333-333333333333";

describe("PAF smoke: approval chain resolution", () => {
  it("hire/rehire chains route straight to HR", () => {
    for (const action of ["hire", "rehire"] as const) {
      const steps = resolveApprovalChain({
        action_type: action,
        manager_user_id: MGR, first_hr_user_id: HR, fallback_admin_user_id: FALLBACK,
      });
      expect(steps.map((s) => s.role)).toEqual(["hr_admin"]);
      expect(steps[0].approver_id).toBe(HR);
    }
  });

  it("separation/promotion/pay_change/transfer chain through supervisor then HR", () => {
    const actions = ["separation", "promotion", "pay_change", "transfer", "position_change",
      "demotion", "reclassification", "status_change", "leave_start", "leave_return", "other"] as const;
    for (const action of actions) {
      const steps = resolveApprovalChain({
        action_type: action,
        manager_user_id: MGR, first_hr_user_id: HR, fallback_admin_user_id: FALLBACK,
      });
      expect(steps.map((s) => s.role)).toEqual(["supervisor", "hr_admin"]);
      expect(steps[0].approver_id).toBe(MGR);
      expect(steps[1].approver_id).toBe(HR);
      expect(steps.map((s) => s.stage)).toEqual([1, 2]);
    }
  });

  it("falls back to the org admin when the employee has no supervisor (dead-end guard)", () => {
    const steps = resolveApprovalChain({
      action_type: "separation",
      manager_user_id: null, first_hr_user_id: HR, fallback_admin_user_id: FALLBACK,
    });
    expect(steps[0].approver_id).toBe(FALLBACK);
    expect(steps[1].approver_id).toBe(HR);
  });

  it("falls back to the org admin when no HR admin exists", () => {
    const steps = resolveApprovalChain({
      action_type: "pay_change",
      manager_user_id: MGR, first_hr_user_id: null, fallback_admin_user_id: FALLBACK,
    });
    expect(steps[1].approver_id).toBe(FALLBACK);
  });

  it("leaves approver null only when fallback admin is also unset (surfaces config gap)", () => {
    const steps = resolveApprovalChain({
      action_type: "separation",
      manager_user_id: null, first_hr_user_id: null, fallback_admin_user_id: null,
    });
    expect(steps.every((s) => s.approver_id === null)).toBe(true);
  });

  it("honors caller-supplied override roles", () => {
    const steps = resolveApprovalChain({
      action_type: "other",
      override_roles: ["hiring_manager", "it_admin", "hr_admin"],
      manager_user_id: MGR, first_hr_user_id: HR, fallback_admin_user_id: FALLBACK,
    });
    expect(steps.map((s) => s.role)).toEqual(["hiring_manager", "it_admin", "hr_admin"]);
    expect(steps[2].approver_id).toBe(HR);
  });

  it("every action type has a registered default chain (no silent fallthrough)", () => {
    const actions = Object.keys(DEFAULT_CHAINS_BY_ACTION);
    expect(actions.length).toBeGreaterThanOrEqual(13);
    for (const a of actions) {
      expect(DEFAULT_CHAINS_BY_ACTION[a as keyof typeof DEFAULT_CHAINS_BY_ACTION].length).toBeGreaterThan(0);
    }
  });
});

describe("PAF smoke: apply patch", () => {
  it("drops unknown columns from after_values", () => {
    const patch = computeApplyPatch({
      action_type: "promotion",
      after_values: { job_title: "Lead Librarian", ssn: "should-not-leak", arbitrary: 1 },
      effective_date: "2026-07-01",
    });
    expect(patch).toEqual({ job_title: "Lead Librarian" });
  });

  it("separation sets offboarded + defaults separation_date + rehire_eligible", () => {
    const patch = computeApplyPatch({
      action_type: "separation",
      after_values: { separation_reason: "voluntary" },
      effective_date: "2026-07-15",
    });
    expect(patch.status).toBe("offboarded");
    expect(patch.separation_date).toBe("2026-07-15");
    expect(patch.rehire_eligible).toBe(true);
    expect(patch.separation_reason).toBe("voluntary");
  });

  it("separation respects an explicit separation_date and rehire_eligible=false", () => {
    const patch = computeApplyPatch({
      action_type: "separation",
      after_values: { separation_date: "2026-08-01", rehire_eligible: false },
      effective_date: "2026-07-15",
    });
    expect(patch.separation_date).toBe("2026-08-01");
    expect(patch.rehire_eligible).toBe(false);
  });

  it("leave_start flips status to on_leave", () => {
    const patch = computeApplyPatch({ action_type: "leave_start", after_values: {}, effective_date: "2026-07-01" });
    expect(patch.status).toBe("on_leave");
  });

  it("leave_return flips status back to active", () => {
    const patch = computeApplyPatch({ action_type: "leave_return", after_values: {}, effective_date: "2026-07-01" });
    expect(patch.status).toBe("active");
  });

  it("rehire clears separation fields and reactivates", () => {
    const patch = computeApplyPatch({ action_type: "rehire", after_values: {}, effective_date: "2026-07-01" });
    expect(patch.status).toBe("active");
    expect(patch.separation_date).toBeNull();
    expect(patch.separation_reason).toBeNull();
  });
});

describe("PAF smoke: apply side effects (offboarding checklist invariant)", () => {
  it("separation seeds the offboarding checklist AND cancels future training", () => {
    const fx = computeApplySideEffects("separation");
    expect(fx.seed_offboarding_checklist).toBe(true);
    expect(fx.cancel_future_training).toBe(true);
  });

  it("non-separation actions do not touch the checklist or training", () => {
    for (const a of ["hire", "promotion", "pay_change", "transfer", "leave_start", "rehire"] as const) {
      const fx = computeApplySideEffects(a);
      expect(fx.seed_offboarding_checklist).toBe(false);
      expect(fx.cancel_future_training).toBe(false);
    }
  });
});