// Pure logic extracted from paf.functions.ts so it can be unit-tested
// without a live Supabase connection. Keep this module free of imports
// from supabase clients, server fns, or anything that touches the network.

export type ApprovalRole = "supervisor" | "hiring_manager" | "hr_admin" | "it_admin";

export type PafActionType =
  | "hire" | "rehire" | "transfer" | "promotion" | "demotion" | "reclassification"
  | "pay_change" | "status_change" | "leave_start" | "leave_return"
  | "separation" | "position_change" | "other";

export const DEFAULT_CHAINS_BY_ACTION: Record<PafActionType, ApprovalRole[]> = {
  hire: ["hr_admin"],
  rehire: ["hr_admin"],
  separation: ["supervisor", "hr_admin"],
  transfer: ["supervisor", "hr_admin"],
  position_change: ["supervisor", "hr_admin"],
  promotion: ["supervisor", "hr_admin"],
  demotion: ["supervisor", "hr_admin"],
  pay_change: ["supervisor", "hr_admin"],
  reclassification: ["supervisor", "hr_admin"],
  status_change: ["supervisor", "hr_admin"],
  leave_start: ["supervisor", "hr_admin"],
  leave_return: ["supervisor", "hr_admin"],
  other: ["supervisor", "hr_admin"],
};

export interface ResolveChainInput {
  action_type: PafActionType;
  override_roles?: ApprovalRole[];
  manager_user_id: string | null;
  first_hr_user_id: string | null;
  fallback_admin_user_id: string | null;
}

export interface ResolvedStep {
  stage: number;
  role: ApprovalRole;
  approver_id: string | null;
}

/** Resolve the ordered approval chain for a PAF, applying the fallback admin
 * whenever a role can't be resolved to a concrete user. This is the single
 * dead-end guard for the PAF lifecycle. */
export function resolveApprovalChain(input: ResolveChainInput): ResolvedStep[] {
  const roles = input.override_roles ?? DEFAULT_CHAINS_BY_ACTION[input.action_type] ?? ["supervisor", "hr_admin"];
  return roles.map((role, i) => {
    let approver_id: string | null = null;
    if (role === "supervisor") approver_id = input.manager_user_id ?? input.fallback_admin_user_id;
    else if (role === "hr_admin") approver_id = input.first_hr_user_id ?? input.fallback_admin_user_id;
    else approver_id = input.fallback_admin_user_id;
    return { stage: i + 1, role, approver_id };
  });
}

const ALLOWED_PATCH_KEYS = new Set([
  "job_title", "department", "status", "position_id", "manager_id",
  "start_date", "end_date", "work_email",
  "separation_date", "separation_reason", "rehire_eligible",
]);

export interface ComputePatchInput {
  action_type: PafActionType;
  after_values: Record<string, unknown>;
  effective_date: string;
}

/** Compute the employees-table patch from a PAF's after_values, applying the
 * action-driven side effects (separation/leave/rehire). */
export function computeApplyPatch(input: ComputePatchInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.after_values ?? {})) {
    if (ALLOWED_PATCH_KEYS.has(k)) patch[k] = v;
  }
  if (input.action_type === "separation") {
    patch.status = "offboarded";
    if (patch.separation_date === undefined) patch.separation_date = input.effective_date;
    if (patch.rehire_eligible === undefined) patch.rehire_eligible = true;
  } else if (input.action_type === "leave_start") {
    patch.status = "on_leave";
  } else if (input.action_type === "leave_return") {
    patch.status = "active";
  } else if (input.action_type === "rehire") {
    patch.status = "active";
    patch.separation_date = null;
    patch.separation_reason = null;
  }
  return patch;
}

/** Side effects that happen on apply, separate from the patch. Tests assert
 * the shape so we never silently drop the offboarding checklist or leave
 * future training assigned to a terminated employee. */
export interface ApplySideEffects {
  seed_offboarding_checklist: boolean;
  cancel_future_training: boolean;
}

export function computeApplySideEffects(action_type: PafActionType): ApplySideEffects {
  if (action_type === "separation") {
    return { seed_offboarding_checklist: true, cancel_future_training: true };
  }
  return { seed_offboarding_checklist: false, cancel_future_training: false };
}