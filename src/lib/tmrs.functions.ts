import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertHr(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data?.length) throw new Error("Forbidden — HR admin only");
}

export const listTmrsFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHr(context.userId);
    const { data: files } = await context.supabase
      .from("tmrs_monthly_files")
      .select("*")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(36);
    const { data: enrollments } = await context.supabase
      .from("tmrs_enrollments")
      .select("id,employee_id,member_rate_pct,enrolled_on,exited_on,employees(first_name,last_name,department)")
      .order("enrolled_on", { ascending: false });
    return { files: files ?? [], enrollments: enrollments ?? [] };
  });

export const upsertTmrsEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    employee_id: z.string().uuid(),
    member_rate_pct: z.number().min(0).max(20),
    enrolled_on: z.string(),
    exited_on: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { error } = await context.supabase.from("tmrs_enrollments").insert({
      employee_id: data.employee_id,
      member_rate_pct: data.member_rate_pct,
      enrolled_on: data.enrolled_on,
      exited_on: data.exited_on ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const composeTmrsFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin.from("org_settings").select("tmrs_employer_match_pct").eq("singleton", true).maybeSingle();
    const employerMatchPct = Number(org?.tmrs_employer_match_pct ?? 14);

    const periodStart = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const next = new Date(data.year, data.month, 1);
    const periodEnd = next.toISOString().slice(0, 10);

    const { data: runs } = await supabaseAdmin
      .from("payroll_runs")
      .select("id")
      .gte("period_start", periodStart)
      .lt("period_start", periodEnd)
      .eq("status", "finalized");
    const runIds = (runs ?? []).map((r) => r.id);

    const { data: lines } = runIds.length
      ? await supabaseAdmin.from("payroll_run_lines").select("employee_id,gross_pay").in("run_id", runIds)
      : { data: [] as { employee_id: string; gross_pay: number }[] };

    const { data: enrolls } = await supabaseAdmin
      .from("tmrs_enrollments").select("employee_id,member_rate_pct,exited_on");
    const enrollMap = new Map<string, number>();
    for (const e of enrolls ?? []) {
      if (e.exited_on && e.exited_on <= periodStart) continue;
      enrollMap.set(e.employee_id, Number(e.member_rate_pct));
    }

    const grouped = new Map<string, number>();
    for (const l of (lines ?? []) as { employee_id: string; gross_pay: number | null }[]) {
      if (!enrollMap.has(l.employee_id)) continue;
      grouped.set(l.employee_id, (grouped.get(l.employee_id) ?? 0) + Number(l.gross_pay ?? 0));
    }

    let totalGross = 0, totalMember = 0, totalEmployer = 0;
    const fileLines: { employee_id: string; gross: number; member_contrib: number; employer_contrib: number }[] = [];
    for (const [empId, gross] of grouped) {
      const rate = enrollMap.get(empId)!;
      const member = Number((gross * rate / 100).toFixed(2));
      const employer = Number((gross * employerMatchPct / 100).toFixed(2));
      totalGross += gross; totalMember += member; totalEmployer += employer;
      fileLines.push({ employee_id: empId, gross, member_contrib: member, employer_contrib: employer });
    }

    // variance vs prior month
    const prior = new Date(data.year, data.month - 2, 1);
    const { data: priorFile } = await supabaseAdmin
      .from("tmrs_monthly_files").select("total_gross")
      .eq("period_year", prior.getFullYear()).eq("period_month", prior.getMonth() + 1).maybeSingle();
    const variance = priorFile?.total_gross ? Number((((totalGross - Number(priorFile.total_gross)) / Number(priorFile.total_gross)) * 100).toFixed(2)) : null;

    const { data: file, error } = await supabaseAdmin.from("tmrs_monthly_files").upsert({
      period_year: data.year,
      period_month: data.month,
      total_gross: totalGross,
      total_member_contrib: totalMember,
      total_employer_contrib: totalEmployer,
      employee_count: fileLines.length,
      variance_pct: variance,
      status: "prepared",
      prepared_by: context.userId,
      prepared_at: new Date().toISOString(),
    }, { onConflict: "period_year,period_month" }).select().single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("tmrs_file_lines").delete().eq("file_id", file.id);
    if (fileLines.length) {
      await supabaseAdmin.from("tmrs_file_lines").insert(fileLines.map((l) => ({ file_id: file.id, ...l })));
    }

    return { file_id: file.id, totals: { totalGross, totalMember, totalEmployer, count: fileLines.length, variance } };
  });

export const signOffTmrsFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ file_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file } = await supabaseAdmin.from("tmrs_monthly_files").select("*").eq("id", data.file_id).single();
    if (!file) throw new Error("File not found");
    if (file.prepared_by === context.userId) throw new Error("Two-person rule: a different HR admin must sign off.");
    if (file.status !== "prepared") throw new Error("File is not in prepared state.");

    const { data: lines } = await supabaseAdmin.from("tmrs_file_lines").select("employee_id,gross,member_contrib,employer_contrib,employees(first_name,last_name,external_id)").eq("file_id", data.file_id);
    const header = ["MemberID","Last","First","Gross","MemberContrib","EmployerContrib"].join(",");
    const rows = (lines ?? []).map((l) => {
      const e = l.employees as { first_name?: string; last_name?: string; external_id?: string } | null;
      return [e?.external_id ?? l.employee_id, e?.last_name ?? "", e?.first_name ?? "", l.gross, l.member_contrib, l.employer_contrib].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const path = `tmrs/${file.period_year}-${String(file.period_month).padStart(2, "0")}.csv`;
    const { error: ue } = await supabaseAdmin.storage.from("compliance-exports").upload(path, new Blob([csv], { type: "text/csv" }), { upsert: true });
    if (ue) throw new Error(ue.message);

    await supabaseAdmin.from("tmrs_monthly_files").update({
      status: "signed_off",
      signed_off_by: context.userId,
      signed_off_at: new Date().toISOString(),
      file_path: path,
    }).eq("id", data.file_id);
    return { ok: true, path };
  });