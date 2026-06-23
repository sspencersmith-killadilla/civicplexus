import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertHr(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data?.length) throw new Error("Forbidden — HR admin only");
}

export const tcoleDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHr(context.userId);
    const { data: officers } = await context.supabase
      .from("employees")
      .select("id,first_name,last_name,department,job_title,status,worker_types!inner(name,is_peace_officer)")
      .eq("status", "active")
      .eq("worker_types.is_peace_officer", true);
    const { data: licenses } = await context.supabase.from("tcole_licenses").select("*");
    const { data: completions } = await context.supabase.from("tcole_completions").select("employee_id,license_id,topic,hours,completed_on");

    const today = new Date().toISOString().slice(0, 10);
    const rows = (officers ?? []).map((o) => {
      const lic = (licenses ?? []).find((l) => l.employee_id === o.id && l.status === "active");
      const cycleStart = lic?.cycle_start;
      const cycleEnd = lic?.cycle_end;
      const hoursInCycle = (completions ?? [])
        .filter((c) => c.employee_id === o.id && (!cycleStart || c.completed_on >= cycleStart) && (!cycleEnd || c.completed_on <= cycleEnd))
        .reduce((s, c) => s + Number(c.hours), 0);
      const daysToExpire = cycleEnd ? Math.floor((new Date(cycleEnd).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)) : null;
      return {
        employee: o,
        license: lic ?? null,
        hours_in_cycle: hoursInCycle,
        required_hours: lic?.required_hours ?? 40,
        days_to_expire: daysToExpire,
        at_risk: lic ? hoursInCycle < (lic.required_hours ?? 40) && (daysToExpire ?? 999) < 90 : true,
      };
    });
    return rows;
  });

export const upsertTcoleLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    employee_id: z.string().uuid(),
    license_number: z.string().min(1),
    license_level: z.enum(["basic","intermediate","advanced","master"]),
    issued_on: z.string(),
    cycle_start: z.string(),
    cycle_end: z.string(),
    required_hours: z.number().int().min(0).default(40),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { error } = await context.supabase.from("tcole_licenses").upsert({
      employee_id: data.employee_id,
      license_number: data.license_number,
      license_level: data.license_level,
      issued_on: data.issued_on,
      cycle_start: data.cycle_start,
      cycle_end: data.cycle_end,
      required_hours: data.required_hours,
      status: "active",
    }, { onConflict: "employee_id,license_number" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordTcoleCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    employee_ids: z.array(z.string().uuid()).min(1),
    topic: z.enum(["legislative_update","cultural_diversity","de_escalation","crisis_intervention","use_of_force","arrest_search_seizure","firearms","racial_profiling","human_trafficking","other"]),
    course_title: z.string().min(1),
    hours: z.number().min(0),
    completed_on: z.string(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { error } = await context.supabase.from("tcole_completions").insert(
      data.employee_ids.map((id) => ({
        employee_id: id,
        topic: data.topic,
        course_title: data.course_title,
        hours: data.hours,
        completed_on: data.completed_on,
        recorded_by: context.userId,
      }))
    );
    if (error) throw new Error(error.message);
    return { ok: true, count: data.employee_ids.length };
  });