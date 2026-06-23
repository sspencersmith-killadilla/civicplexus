import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "crypto";

async function assertHr(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data?.length) throw new Error("Forbidden — HR admin only");
}

export const upsertPayGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional().nullable(),
      is_active: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { error } = await supabaseAdmin.from("pay_groups").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin.from("pay_groups").insert(data).select().single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const createPayPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      pay_group_id: z.string().uuid(),
      period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      check_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("pay_periods")
      .insert({ ...data, status: "draft" })
      .select().single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

function hoursInPeriod(startISO: string, endISO: string, leaveStart: string, leaveEnd: string, hoursPerDay = 8): number {
  const a = new Date(Math.max(new Date(startISO).getTime(), new Date(leaveStart).getTime()));
  const b = new Date(Math.min(new Date(endISO).getTime(), new Date(leaveEnd).getTime()));
  if (b < a) return 0;
  let days = 0;
  const cur = new Date(a);
  while (cur <= b) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return days * hoursPerDay;
}

export const assemblePayPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pay_period_id: z.string().uuid(), profile_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: period } = await supabaseAdmin.from("pay_periods").select("*").eq("id", data.pay_period_id).maybeSingle();
    if (!period) throw new Error("Pay period not found");
    if (period.status === "locked" || period.status === "exported") throw new Error("Period is locked");

    const { data: emps } = await supabaseAdmin
      .from("employees")
      .select("id, first_name, last_name, status")
      .eq("status", "active");

    if (!emps?.length) throw new Error("No active employees to assemble");

    const empIds = emps.map((e) => e.id);
    const { data: latestComps } = await supabaseAdmin
      .from("employee_comp")
      .select("employee_id, base_annual, hourly_rate, effective_date")
      .in("employee_id", empIds)
      .lte("effective_date", period.period_end)
      .order("effective_date", { ascending: false });

    const compByEmp = new Map<string, { base_annual: number | null; hourly_rate: number | null }>();
    for (const c of latestComps ?? []) {
      if (!compByEmp.has(c.employee_id)) compByEmp.set(c.employee_id, { base_annual: c.base_annual, hourly_rate: c.hourly_rate });
    }

    const { data: leaves } = await supabaseAdmin
      .from("leave_requests")
      .select("employee_id, plan_id, start_date, end_date, status, leave_plans(code, is_fmla, paid)")
      .in("employee_id", empIds)
      .eq("status", "approved")
      .lte("start_date", period.period_end)
      .gte("end_date", period.period_start);

    // Build/replace run in draft state
    const { data: existing } = await supabaseAdmin
      .from("payroll_runs").select("id, status")
      .eq("pay_period_id", data.pay_period_id)
      .eq("profile_id", data.profile_id)
      .neq("status", "superseded");
    if (existing?.some((r) => r.status === "released" || r.status === "signed_off")) {
      throw new Error("A signed-off run already exists; create a correction instead");
    }
    if (existing?.length) {
      await supabaseAdmin.from("payroll_runs").update({ status: "superseded" }).in("id", existing.map((r) => r.id));
    }

    const { data: run, error: runErr } = await supabaseAdmin
      .from("payroll_runs")
      .insert({
        pay_period_id: data.pay_period_id,
        profile_id: data.profile_id,
        run_kind: "regular",
        status: "draft",
        prepared_by: context.userId,
        prepared_at: new Date().toISOString(),
      })
      .select().single();
    if (runErr) throw new Error(runErr.message);

    // Daily working hours assumption: 8h/day, biweekly = 80 base hours
    const baseHours = 80;
    let totalGross = 0;
    let totalHours = 0;
    type LeaveRow = {
      employee_id: string;
      plan_id: string;
      start_date: string;
      end_date: string;
      leave_plans: { code: string; is_fmla: boolean; paid: boolean } | null;
    };
    const leaveRows = (leaves ?? []) as unknown as LeaveRow[];
    const lines = emps.map((e) => {
      const comp = compByEmp.get(e.id);
      const empLeaves = leaveRows.filter((l) => l.employee_id === e.id);
      const codeOf = (l: LeaveRow) => (l.leave_plans?.code ?? "").toLowerCase();
      const pto = empLeaves.filter((l) => codeOf(l).includes("pto") || codeOf(l).includes("vac"))
        .reduce((s, l) => s + hoursInPeriod(period.period_start, period.period_end, l.start_date, l.end_date), 0);
      const sick = empLeaves.filter((l) => codeOf(l).includes("sick"))
        .reduce((s, l) => s + hoursInPeriod(period.period_start, period.period_end, l.start_date, l.end_date), 0);
      const fmla = empLeaves.filter((l) => l.leave_plans?.is_fmla)
        .reduce((s, l) => s + hoursInPeriod(period.period_start, period.period_end, l.start_date, l.end_date), 0);
      const leaveHrs = pto + sick + fmla;
      const regularHours = Math.max(0, baseHours - leaveHrs);
      const hourly = comp?.hourly_rate ?? (comp?.base_annual ? Number(comp.base_annual) / 2080 : 0);
      const gross = Number((hourly * (regularHours + pto + sick)).toFixed(2));
      const warnings: string[] = [];
      if (!comp) warnings.push("No comp record");
      if (!hourly) warnings.push("No pay rate");
      totalGross += gross;
      totalHours += regularHours + leaveHrs;
      return {
        run_id: run.id,
        employee_id: e.id,
        base_annual: comp?.base_annual ?? null,
        hourly_rate: hourly || null,
        regular_hours: regularHours,
        overtime_hours: 0,
        pto_hours: pto,
        sick_hours: sick,
        fmla_hours: fmla,
        one_time_items: [],
        gross_pay: gross,
        warnings,
      };
    });

    const { error: linesErr } = await supabaseAdmin.from("payroll_run_lines").insert(lines);
    if (linesErr) throw new Error(linesErr.message);

    await supabaseAdmin.from("payroll_runs").update({
      total_gross: Number(totalGross.toFixed(2)),
      total_hours: Number(totalHours.toFixed(2)),
      headcount: emps.length,
      status: "awaiting_signoff",
    }).eq("id", run.id);

    await supabaseAdmin.from("pay_periods").update({ status: "assembled" }).eq("id", period.id);

    return { run_id: run.id, headcount: emps.length, total_gross: totalGross };
  });

export const signOffPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: run } = await supabaseAdmin.from("payroll_runs").select("*").eq("id", data.run_id).maybeSingle();
    if (!run) throw new Error("Run not found");
    if (run.status !== "awaiting_signoff") throw new Error("Run not awaiting sign-off");
    if (run.prepared_by === context.userId) throw new Error("Two-person rule: a different HR admin must sign off");
    await supabaseAdmin.from("payroll_runs").update({
      status: "signed_off",
      signed_off_by: context.userId,
      signed_off_at: new Date().toISOString(),
    }).eq("id", data.run_id);
    return { ok: true };
  });

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const generatePayrollFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: run } = await supabaseAdmin.from("payroll_runs").select("*").eq("id", data.run_id).maybeSingle();
    if (!run) throw new Error("Run not found");
    if (run.status !== "signed_off") throw new Error("Run must be signed off before release");

    const { data: profile } = await supabaseAdmin.from("payroll_export_profiles").select("*").eq("id", run.profile_id).maybeSingle();
    if (!profile) throw new Error("Profile not found");
    const { data: period } = await supabaseAdmin.from("pay_periods").select("*").eq("id", run.pay_period_id).maybeSingle();
    if (!period) throw new Error("Period not found");
    const { data: lines } = await supabaseAdmin
      .from("payroll_run_lines")
      .select("*, employees(first_name, last_name, work_email)")
      .eq("run_id", data.run_id);

    const map = (profile.column_map ?? {}) as Record<string, string>;
    const headers = [
      map.employee_id ?? "Employee ID",
      map.first ?? "First Name",
      map.last ?? "Last Name",
      map.reg_hours ?? "Regular Hours",
      map.ot_hours ?? "Overtime Hours",
      "PTO Hours",
      "Sick Hours",
      "FMLA Hours",
      map.gross ?? "Gross Pay",
    ];
    const rows: string[][] = [headers];
    for (const l of lines ?? []) {
      const emp = (l as { employees: { first_name: string; last_name: string } | null }).employees;
      rows.push([
        l.employee_id,
        emp?.first_name ?? "",
        emp?.last_name ?? "",
        String(l.regular_hours ?? 0),
        String(l.overtime_hours ?? 0),
        String(l.pto_hours ?? 0),
        String(l.sick_hours ?? 0),
        String(l.fmla_hours ?? 0),
        String(l.gross_pay ?? 0),
      ]);
    }
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const buf = Buffer.from(csv, "utf8");
    const hash = createHash("sha256").update(buf).digest("hex");
    const filename = `${period.period_start}_${profile.bureau}_${run.id}.csv`;
    const path = `${period.id}/${filename}`;

    const { error: upErr } = await supabaseAdmin.storage.from("payroll-exports").upload(path, buf, {
      contentType: "text/csv",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin.from("payroll_runs").update({
      file_path: path,
      file_hash: hash,
      status: "released",
      released_at: new Date().toISOString(),
    }).eq("id", data.run_id);
    await supabaseAdmin.from("pay_periods").update({ status: "exported" }).eq("id", run.pay_period_id);

    return { path, hash, size: buf.length };
  });

export const signedPayrollFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ run_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: run } = await supabaseAdmin.from("payroll_runs").select("file_path").eq("id", data.run_id).maybeSingle();
    if (!run?.file_path) throw new Error("No file yet");
    const { data: signed, error } = await supabaseAdmin.storage.from("payroll-exports").createSignedUrl(run.file_path, 600);
    if (error || !signed) throw new Error(error?.message ?? "Sign failed");
    return { url: signed.signedUrl };
  });