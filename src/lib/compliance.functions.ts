import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertHr(ctx: { supabase: { from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { eq: (col: string, v: string) => Promise<{ data: unknown[] | null }> } } } }; userId: string }) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "hr_admin");
  if (!data?.length) throw new Error("Forbidden — HR admin only");
}

// ---------- FLSA ----------
export const listFlsaAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHr(context);
    const { data: positions, error } = await context.supabase
      .from("positions")
      .select("id,title,department,flsa_class,pay_grade,status,reports_to_position_id")
      .order("title");
    if (error) throw new Error(error.message);
    const { data: reviews } = await context.supabase
      .from("flsa_reviews")
      .select("position_id,reviewed_at,decision,exempt_basis,duties_test_notes,next_review_date")
      .order("reviewed_at", { ascending: false });
    const latest = new Map<string, NonNullable<typeof reviews>[number]>();
    for (const r of reviews ?? []) if (!latest.has(r.position_id)) latest.set(r.position_id, r);
    return (positions ?? []).map((p) => {
      const last = latest.get(p.id);
      const needsReview =
        !p.flsa_class ||
        !last ||
        (last.next_review_date && new Date(last.next_review_date) < new Date());
      return { ...p, last_review: last ?? null, needs_review: !!needsReview };
    });
  });

export const recordFlsaReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      position_id: z.string().uuid(),
      decision: z.enum(["exempt", "non_exempt", "needs_review"]),
      exempt_basis: z.string().max(200).optional().nullable(),
      duties_test_notes: z.string().max(5000).optional().nullable(),
      next_review_date: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context);
    const { error } = await context.supabase.from("flsa_reviews").insert({
      position_id: data.position_id,
      reviewed_by: context.userId,
      decision: data.decision,
      exempt_basis: data.exempt_basis ?? null,
      duties_test_notes: data.duties_test_notes ?? null,
      next_review_date: data.next_review_date || null,
    });
    if (error) throw new Error(error.message);
    if (data.decision !== "needs_review") {
      await context.supabase
        .from("positions")
        .update({ flsa_class: data.decision })
        .eq("id", data.position_id);
    }
    return { ok: true };
  });

// ---------- EEO Workforce Snapshot ----------
export const eeoWorkforceSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ asOf: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context);
    const { data: emps, error } = await context.supabase
      .from("employees")
      .select("id,department,status,start_date,end_date,worker_type_id,worker_types(name)")
      .lte("start_date", data.asOf);
    if (error) throw new Error(error.message);
    // current as-of
    const active = (emps ?? []).filter((e) => {
      const ended = e.end_date && new Date(e.end_date) <= new Date(data.asOf);
      return !ended && e.status !== "candidate";
    });
    const byDept: Record<string, { headcount: number; ft: number; pt: number }> = {};
    for (const e of active) {
      const dept = e.department ?? "Unassigned";
      byDept[dept] ??= { headcount: 0, ft: 0, pt: 0 };
      byDept[dept].headcount++;
      const wt = (e.worker_types as { name?: string } | null)?.name?.toLowerCase() ?? "";
      if (wt.includes("part")) byDept[dept].pt++;
      else byDept[dept].ft++;
    }
    return {
      asOf: data.asOf,
      total: active.length,
      byDepartment: Object.entries(byDept).map(([dept, v]) => ({ department: dept, ...v })),
    };
  });

// ---------- Audit Log filters ----------
export const queryAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      entity: z.string().optional(),
      action: z.string().optional(),
      actor_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(2000).default(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context);
    let q = context.supabase.from("audit_events").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.entity) q = q.eq("entity", data.entity);
    if (data.action) q = q.eq("action", data.action);
    if (data.actor_id) q = q.eq("actor_id", data.actor_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });