import type { SupabaseClient } from "@supabase/supabase-js";

type EnrollRow = {
  id: string;
  employee_id: string;
  plan_id: string;
  opening_balance_hours: number;
  effective_from: string;
  effective_to: string | null;
  employees: { start_date: string | null; worker_type_id: string | null } | null;
  leave_plans: { max_balance_hours: number | null; is_active: boolean } | null;
};

type RuleRow = {
  id: string;
  plan_id: string;
  worker_type_id: string | null;
  min_months_service: number;
  max_months_service: number | null;
  accrual_hours: number;
  frequency: "per_pay_period" | "monthly" | "annually";
  max_balance_hours: number | null;
  is_active: boolean;
};

type BalanceRow = {
  id: string;
  employee_id: string;
  plan_id: string;
  accrued_hours: number;
  used_hours: number;
  last_accrual_at: string | null;
};

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function pickRule(rules: RuleRow[], workerTypeId: string | null, months: number): RuleRow | null {
  const matches = rules.filter(
    (r) => r.is_active
      && (r.worker_type_id === workerTypeId || r.worker_type_id === null)
      && r.min_months_service <= months
      && (r.max_months_service === null || r.max_months_service > months),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    // worker-type-specific rule wins over any-worker-type rule
    const aw = a.worker_type_id === workerTypeId ? 1 : 0;
    const bw = b.worker_type_id === workerTypeId ? 1 : 0;
    if (aw !== bw) return bw - aw;
    // higher tenure floor wins
    return b.min_months_service - a.min_months_service;
  });
  return matches[0];
}

function isDueThisPeriod(freq: RuleRow["frequency"], last: string | null, now: Date): boolean {
  if (!last) return true;
  const d = new Date(last);
  if (freq === "monthly") {
    return !(d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth());
  }
  if (freq === "annually") {
    return d.getUTCFullYear() !== now.getUTCFullYear();
  }
  // per_pay_period ~ 14 days between accruals
  const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 13.5;
}

export type AccrualRunResult = {
  scanned: number;
  updated: number;
  skipped_no_rule: number;
  skipped_not_due: number;
  errors: number;
};

export type AccrualPreviewItem = {
  employee_id: string;
  plan_id: string;
  current_accrued: number;
  delta: number;
  next_accrued: number;
  capped: boolean;
  frequency: RuleRow["frequency"];
  months_service: number;
};

export type AccrualRunOptions = { now?: Date; dryRun?: boolean };

export async function runLeaveAccruals(
  admin: SupabaseClient,
  optsOrNow: Date | AccrualRunOptions = {},
): Promise<AccrualRunResult & { preview?: AccrualPreviewItem[] }> {
  const opts: AccrualRunOptions = optsOrNow instanceof Date ? { now: optsOrNow } : optsOrNow;
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const today = now.toISOString().slice(0, 10);

  const { data: rulesRaw, error: rulesErr } = await admin
    .from("leave_accrual_rules")
    .select("id, plan_id, worker_type_id, min_months_service, max_months_service, accrual_hours, frequency, max_balance_hours, is_active")
    .eq("is_active", true);
  if (rulesErr) throw new Error(`rules: ${rulesErr.message}`);
  const rules = (rulesRaw ?? []) as RuleRow[];
  const rulesByPlan = new Map<string, RuleRow[]>();
  for (const r of rules) {
    const arr = rulesByPlan.get(r.plan_id) ?? [];
    arr.push(r);
    rulesByPlan.set(r.plan_id, arr);
  }

  const { data: enrollsRaw, error: enrollsErr } = await admin
    .from("employee_leave_enrollments")
    .select("id, employee_id, plan_id, opening_balance_hours, effective_from, effective_to, employees(start_date, worker_type_id), leave_plans(max_balance_hours, is_active)")
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gt.${today}`);
  if (enrollsErr) throw new Error(`enrollments: ${enrollsErr.message}`);
  const enrollments = (enrollsRaw ?? []) as unknown as EnrollRow[];

  const result: AccrualRunResult & { preview?: AccrualPreviewItem[] } = { scanned: enrollments.length, updated: 0, skipped_no_rule: 0, skipped_not_due: 0, errors: 0 };
  const preview: AccrualPreviewItem[] = [];

  for (const e of enrollments) {
    if (!e.leave_plans?.is_active) continue;
    const emp = e.employees;
    if (!emp) continue;

    const start = emp.start_date ? new Date(emp.start_date) : new Date(e.effective_from);
    const months = Math.max(0, monthsBetween(start, now));
    const rule = pickRule(rulesByPlan.get(e.plan_id) ?? [], emp.worker_type_id, months);
    if (!rule || rule.accrual_hours <= 0) { result.skipped_no_rule++; continue; }

    const { data: balRaw } = await admin
      .from("leave_balances")
      .select("id, employee_id, plan_id, accrued_hours, used_hours, last_accrual_at")
      .eq("employee_id", e.employee_id).eq("plan_id", e.plan_id).maybeSingle();
    const bal = balRaw as BalanceRow | null;

    if (!isDueThisPeriod(rule.frequency, bal?.last_accrual_at ?? null, now)) {
      result.skipped_not_due++;
      continue;
    }

    const cap = rule.max_balance_hours ?? e.leave_plans.max_balance_hours ?? null;
    const currentAccrued = Number(bal?.accrued_hours ?? e.opening_balance_hours ?? 0);
    const uncapped = currentAccrued + Number(rule.accrual_hours);
    const next = cap !== null ? Math.min(uncapped, Number(cap)) : uncapped;
    const capped = cap !== null && uncapped > Number(cap);

    if (dryRun) {
      preview.push({
        employee_id: e.employee_id,
        plan_id: e.plan_id,
        current_accrued: currentAccrued,
        delta: next - currentAccrued,
        next_accrued: next,
        capped,
        frequency: rule.frequency,
        months_service: months,
      });
      result.updated++;
      continue;
    }

    try {
      if (bal) {
        const { error: upErr } = await admin.from("leave_balances")
          .update({ accrued_hours: next, last_accrual_at: now.toISOString() } as never)
          .eq("id", bal.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await admin.from("leave_balances").insert({
          employee_id: e.employee_id,
          plan_id: e.plan_id,
          accrued_hours: next,
          used_hours: 0,
          pending_hours: 0,
          last_accrual_at: now.toISOString(),
        } as never);
        if (insErr) throw insErr;
      }
      result.updated++;
    } catch {
      result.errors++;
    }
  }

  if (dryRun) result.preview = preview;
  return result;
}