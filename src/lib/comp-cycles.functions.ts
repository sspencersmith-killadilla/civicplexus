import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertHr(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data?.length) throw new Error("Forbidden — HR admin only");
}

export const createCompCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(2).max(150),
      period_start: z.string(),
      period_end: z.string(),
      effective_date: z.string(),
      budget_pct: z.number().min(0).max(100).default(3),
      departments: z.array(z.string()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("comp_cycles").insert({
      name: data.name,
      period_start: data.period_start,
      period_end: data.period_end,
      effective_date: data.effective_date,
      budget_pct: data.budget_pct,
      eligibility_filter: data.departments?.length ? { departments: data.departments } : {},
      created_by: context.userId,
      status: "draft",
    }).select().single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const openCompCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("comp_cycles").update({ status: "open" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      participant_id: z.string().uuid(),
      proposed_merit_pct: z.number().min(0).max(100).optional().nullable(),
      proposed_promotion_grade_id: z.string().uuid().optional().nullable(),
      proposed_bonus_amount: z.number().min(0).optional().nullable(),
      manager_notes: z.string().max(2000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("comp_review_participants").update({
      proposed_merit_pct: data.proposed_merit_pct,
      proposed_promotion_grade_id: data.proposed_promotion_grade_id,
      proposed_bonus_amount: data.proposed_bonus_amount,
      manager_notes: data.manager_notes,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    }).eq("id", data.participant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const approveProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ participant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("comp_review_participants").update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: context.userId,
    }).eq("id", data.participant_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finalizeCompCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cycle, error: ce } = await supabaseAdmin.from("comp_cycles").select("*").eq("id", data.id).single();
    if (ce || !cycle) throw new Error(ce?.message ?? "Cycle not found");
    const { data: parts } = await supabaseAdmin
      .from("comp_review_participants")
      .select("*,current_comp:employee_comp!comp_review_participants_current_comp_id_fkey(base_annual,hourly_rate,target_bonus_pct,currency)")
      .eq("cycle_id", data.id)
      .eq("status", "approved");
    let applied = 0;
    for (const p of parts ?? []) {
      const cur = (p as { current_comp: { base_annual: number | null; hourly_rate: number | null; target_bonus_pct: number | null; currency: string } | null }).current_comp;
      const meritPct = p.proposed_merit_pct ?? 0;
      const newBase = cur?.base_annual ? Number((cur.base_annual * (1 + meritPct / 100)).toFixed(2)) : null;
      const newHourly = cur?.hourly_rate ? Number((cur.hourly_rate * (1 + meritPct / 100)).toFixed(2)) : null;
      const { error } = await supabaseAdmin.from("employee_comp").insert({
        employee_id: p.employee_id,
        effective_date: cycle.effective_date,
        base_annual: newBase,
        hourly_rate: newHourly,
        target_bonus_pct: cur?.target_bonus_pct ?? null,
        currency: cur?.currency ?? "USD",
        pay_grade_id: p.proposed_promotion_grade_id,
        source: "cycle",
        cycle_id: cycle.id,
        change_reason: `Comp cycle: ${cycle.name} (+${meritPct}%)`,
        created_by: context.userId,
      });
      if (!error) {
        await supabaseAdmin.from("comp_review_participants").update({ status: "applied" }).eq("id", p.id);
        applied++;
      }
    }
    await supabaseAdmin.from("comp_cycles").update({ status: "finalized" }).eq("id", data.id);
    return { applied };
  });

export const myCompCycleParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cycle_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase.from("employees").select("id").eq("user_id", context.userId).maybeSingle();
    if (!me) return [];
    const { data: rows, error } = await context.supabase
      .from("comp_review_participants")
      .select("*,employees!comp_review_participants_employee_id_fkey(first_name,last_name,department,job_title),current_comp:employee_comp!comp_review_participants_current_comp_id_fkey(base_annual,hourly_rate,currency,pay_grade_id),pay_grades:proposed_promotion_grade_id(code,mid_annual)")
      .eq("cycle_id", data.cycle_id)
      .eq("manager_id", me.id);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const allCompCycleParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cycle_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("comp_review_participants")
      .select("*,employees!comp_review_participants_employee_id_fkey(first_name,last_name,department),current_comp:employee_comp!comp_review_participants_current_comp_id_fkey(base_annual,currency,pay_grade_id),pay_grades:proposed_promotion_grade_id(code,mid_annual)")
      .eq("cycle_id", data.cycle_id);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });