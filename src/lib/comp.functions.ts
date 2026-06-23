import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertHr(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data?.length) throw new Error("Forbidden — HR admin only");
}

export const upsertPayGrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      code: z.string().min(1).max(20),
      name: z.string().min(1).max(100),
      currency: z.string().length(3).default("USD"),
      min_annual: z.number().min(0),
      mid_annual: z.number().min(0),
      max_annual: z.number().min(0),
      flsa_default: z.enum(["exempt", "non_exempt"]).optional().nullable(),
      is_active: z.boolean().default(true),
      notes: z.string().max(2000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { error } = await supabaseAdmin.from("pay_grades").update(data).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin.from("pay_grades").insert(data).select().single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const recordEmployeeComp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      employee_id: z.string().uuid(),
      effective_date: z.string(),
      base_annual: z.number().nullable().optional(),
      hourly_rate: z.number().nullable().optional(),
      target_bonus_pct: z.number().nullable().optional(),
      target_equity: z.number().nullable().optional(),
      currency: z.string().length(3).default("USD"),
      pay_grade_id: z.string().uuid().nullable().optional(),
      change_reason: z.string().max(500).optional().nullable(),
      source: z.enum(["hire", "merit", "promotion", "adjustment", "cycle", "market"]).default("adjustment"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("employee_comp")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const importMarketRanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      rows: z.array(
        z.object({
          job_family: z.string(),
          level: z.string(),
          geo: z.string().default("US"),
          currency: z.string().length(3).default("USD"),
          p25: z.number(),
          p50: z.number(),
          p75: z.number(),
          source: z.string().optional(),
          effective_date: z.string().optional(),
        }),
      ).min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("market_ranges").insert(data.rows);
    if (error) throw new Error(error.message);
    return { inserted: data.rows.length };
  });

export const employeeCompHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ employee_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("employee_comp")
      .select("*,pay_grades(code,mid_annual)")
      .eq("employee_id", data.employee_id)
      .order("effective_date", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });