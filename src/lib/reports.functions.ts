import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHrAdmin } from "@/lib/role-check.server";

export const buildEeo4Report = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { snapshot_date?: string }) => z.object({ snapshot_date: z.string().optional() }).parse(d))
  .handler(async ({ context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { data: emps, error } = await context.supabase
      .from("employees").select("id,first_name,last_name,department,job_title,gender,ethnicity")
      .eq("status", "active");
    if (error) throw new Error(error.message);

    type Bucket = Record<string, Record<string, number>>;
    const buckets: Bucket = {};
    for (const e of emps ?? []) {
      const dept = (e as any).department ?? "Unassigned";
      const key = `${(e as any).gender ?? "U"}|${(e as any).ethnicity ?? "U"}`;
      buckets[dept] = buckets[dept] || {};
      buckets[dept][key] = (buckets[dept][key] || 0) + 1;
    }
    return { total: emps?.length ?? 0, by_dept: buckets };
  });

export const saveReportSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { report_kind: string; period_label: string; data: unknown; notes?: string }) =>
    z.object({ report_kind: z.string(), period_label: z.string(), data: z.unknown(), notes: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("report_snapshots").insert({
      report_kind: data.report_kind,
      period_label: data.period_label,
      generated_by: context.userId,
      data: data.data as never,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const buildOsha300Summary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number }) => z.object({ year: z.number().int().min(2000).max(2100) }).parse(d))
  .handler(async ({ data, context }) => {
    const start = `${data.year}-01-01`;
    const end = `${data.year}-12-31`;
    const { data: rows, error } = await context.supabase
      .from("osha_incidents").select("*")
      .gte("incident_date", start).lte("incident_date", end);
    if (error) throw new Error(error.message);
    const totals = {
      total_cases: rows?.length ?? 0,
      deaths: 0,
      days_away_cases: 0,
      restricted_cases: 0,
      other_recordable: 0,
      total_days_away: 0,
      total_days_restricted: 0,
    };
    for (const r of rows ?? []) {
      if (!r.recordable) continue;
      if (r.outcome === "death") totals.deaths++;
      else if (r.outcome === "days_away") totals.days_away_cases++;
      else if (r.outcome === "restricted_transfer") totals.restricted_cases++;
      else totals.other_recordable++;
      totals.total_days_away += r.days_away ?? 0;
      totals.total_days_restricted += r.days_restricted ?? 0;
    }
    return { year: data.year, totals, incidents: rows ?? [] };
  });
