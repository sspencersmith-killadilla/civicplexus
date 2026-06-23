import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const createReviewCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    name: z.string().min(2).max(160),
    period_start: z.string().regex(dateRe),
    period_end: z.string().regex(dateRe),
    self_review_due: z.string().regex(dateRe).optional().nullable(),
    manager_review_due: z.string().regex(dateRe).optional().nullable(),
    signoff_due: z.string().regex(dateRe).optional().nullable(),
    departments: z.array(z.string()).optional(),
    template_key: z.string().optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const eligibility = data.departments?.length ? { departments: data.departments } : {};
    const { data: row, error } = await context.supabase
      .from("review_cycles" as never)
      .insert({
        name: data.name,
        period_start: data.period_start,
        period_end: data.period_end,
        self_review_due: data.self_review_due ?? null,
        manager_review_due: data.manager_review_due ?? null,
        signoff_due: data.signoff_due ?? null,
        eligibility_filter: eligibility,
        template_key: data.template_key ?? null,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as { id: string };
  });

export const setCycleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    cycle_id: z.string().uuid(),
    status: z.enum(["draft", "open", "in_calibration", "closed"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "open") patch.kickoff_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("review_cycles" as never)
      .update(patch as never)
      .eq("id", data.cycle_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recalibrateRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    review_id: z.string().uuid(),
    to_rating: z.number().min(1).max(5),
    reason: z.string().max(2000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: cur } = await context.supabase
      .from("performance_reviews")
      .select("overall_rating")
      .eq("id", data.review_id)
      .single();
    const from = (cur as { overall_rating: number | null } | null)?.overall_rating ?? null;

    const { error } = await context.supabase
      .from("performance_reviews")
      .update({ overall_rating: data.to_rating })
      .eq("id", data.review_id);
    if (error) throw new Error(error.message);

    await context.supabase.from("review_rating_changes" as never).insert({
      review_id: data.review_id,
      from_rating: from,
      to_rating: data.to_rating,
      reason: data.reason ?? null,
      changed_by: context.userId,
    } as never);

    return { ok: true };
  });

export const sendCycleReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    cycle_id: z.string().uuid(),
    target: z.enum(["self_not_submitted", "manager_not_submitted", "not_acknowledged"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: parts } = await context.supabase
      .from("review_cycle_participants" as never)
      .select("review_id, employee_id, manager_id, status, employees:employee_id(first_name,last_name,user_id), managers:manager_id(user_id)")
      .eq("cycle_id", data.cycle_id);
    const rows = (parts ?? []) as unknown as Array<{
      review_id: string | null; status: string;
      employees: { first_name: string; last_name: string; user_id: string | null } | null;
      managers: { user_id: string | null } | null;
    }>;
    const notifs: Array<{ user_id: string; type: string; title: string; body: string; link: string }> = [];
    for (const p of rows) {
      if (data.target === "self_not_submitted" && p.status === "not_started" && p.employees?.user_id) {
        notifs.push({ user_id: p.employees.user_id, type: "review_cycle", title: "Self-assessment due",
          body: "Please submit your self-assessment", link: `/reviews/${p.review_id}` });
      }
      if (data.target === "manager_not_submitted" && (p.status === "not_started" || p.status === "self_submitted") && p.managers?.user_id) {
        notifs.push({ user_id: p.managers.user_id, type: "review_cycle", title: "Manager review due",
          body: `Review for ${p.employees?.first_name ?? ""} ${p.employees?.last_name ?? ""} is pending`,
          link: `/reviews/${p.review_id}` });
      }
      if (data.target === "not_acknowledged" && p.status !== "acknowledged" && p.status !== "finalized" && p.employees?.user_id) {
        notifs.push({ user_id: p.employees.user_id, type: "review_cycle", title: "Acknowledge your review",
          body: "Your review is ready for sign-off", link: `/reviews/${p.review_id}` });
      }
    }
    if (notifs.length) await context.supabase.from("notifications").insert(notifs);
    return { sent: notifs.length };
  });

export const upsertReviewRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    review_id: z.string().uuid(),
    competency: z.string().min(1).max(80),
    rating: z.number().min(1).max(5).nullable().optional(),
    comment: z.string().max(4000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("review_ratings" as never)
      .upsert({
        review_id: data.review_id,
        competency: data.competency,
        rating: data.rating ?? null,
        comment: data.comment ?? null,
      } as never, { onConflict: "review_id,competency" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateParticipantStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    cycle_id: z.string().uuid(),
    employee_id: z.string().uuid(),
    status: z.enum(["not_started", "self_submitted", "manager_submitted", "calibrated", "acknowledged", "finalized"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("review_cycle_participants" as never)
      .update({ status: data.status } as never)
      .eq("cycle_id", data.cycle_id)
      .eq("employee_id", data.employee_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });