import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";
function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

export const createAnnualReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      employee_id: z.string().uuid(),
      period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("performance_reviews")
      .insert({
        employee_id: data.employee_id,
        manager_user_id: context.userId,
        review_period_start: data.period_start,
        review_period_end: data.period_end,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.rpc("record_audit_event" as never, {
      _action: "create", _entity: "performance_review", _entity_id: row.id,
      _diff: { employee_id: data.employee_id },
    } as never);
    return row;
  });

/** Pull all 1-on-1 notes/action-items + goals for the employee/period as structured context. */
export const compileReviewContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ review_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: review, error } = await context.supabase
      .from("performance_reviews")
      .select("id, employee_id, review_period_start, review_period_end")
      .eq("id", data.review_id)
      .maybeSingle();
    if (error || !review) throw new Error("Review not found");

    const startIso = new Date(review.review_period_start).toISOString();
    const endIso = new Date(review.review_period_end + "T23:59:59Z").toISOString();

    const { data: sessions } = await context.supabase
      .from("one_on_ones")
      .select("id, title, scheduled_at, summary, ai_summary, status")
      .eq("employee_id", review.employee_id)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: true });

    const sessionIds = (sessions ?? []).map((s) => s.id);
    const [{ data: notes }, { data: actions }] = await Promise.all([
      sessionIds.length
        ? context.supabase.from("one_on_one_notes").select("session_id, visibility, content, created_at").in("session_id", sessionIds).eq("visibility", "shared")
        : Promise.resolve({ data: [] as Array<{ session_id: string; visibility: string; content: string; created_at: string }> }),
      sessionIds.length
        ? context.supabase.from("one_on_one_action_items").select("session_id, text, status, due_date, completed_at").in("session_id", sessionIds)
        : Promise.resolve({ data: [] as Array<{ session_id: string; text: string; status: string; due_date: string | null; completed_at: string | null }> }),
    ]);

    const { data: goals } = await context.supabase
      .from("goals")
      .select("id, title, description, category, status, progress, target_date, created_at")
      .eq("owner_employee_id", review.employee_id);

    const goalIds = (goals ?? []).map((g) => g.id);
    const { data: goalUpdates } = goalIds.length
      ? await context.supabase.from("goal_updates").select("goal_id, note, progress, created_at").in("goal_id", goalIds).order("created_at", { ascending: true })
      : { data: [] };

    return {
      sessions: sessions ?? [],
      notes: notes ?? [],
      action_items: actions ?? [],
      goals: goals ?? [],
      goal_updates: goalUpdates ?? [],
    };
  });

export const generateReviewDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ review_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await compileReviewContext({ data: { review_id: data.review_id } });

    const summary = [
      `# 1-on-1 sessions (${ctx.sessions.length})`,
      ...ctx.sessions.map((s) => `- ${s.scheduled_at ?? s.id}: ${s.title ?? "1-on-1"} — ${s.ai_summary ?? s.summary ?? "(no summary)"}`),
      ``,
      `# Shared notes (${ctx.notes.length})`,
      ...ctx.notes.slice(0, 80).map((n) => `- ${n.content}`),
      ``,
      `# Action items (${ctx.action_items.length})`,
      ...ctx.action_items.map((a) => `- [${a.status}] ${a.text}${a.due_date ? ` (due ${a.due_date})` : ""}`),
      ``,
      `# Goals (${ctx.goals.length})`,
      ...ctx.goals.map((g) => `- ${g.title} — ${g.status} ${g.progress ?? 0}%${g.target_date ? ` (target ${g.target_date})` : ""}`),
      ``,
      `# Goal updates`,
      ...ctx.goal_updates.map((u) => `- ${u.created_at}: ${u.note ?? ""} (${u.progress ?? 0}%)`),
    ].join("\n");

    const prompt = `You are an HR coach drafting an annual performance review for a municipal employee.
Using the inputs below (1-on-1 history, action items, goals & progress), produce a balanced draft with these sections in markdown:

## Overall Summary
## Key Accomplishments
## Progress Against Goals
## Strengths Demonstrated
## Areas for Development
## Suggested Focus for Next Cycle
## Suggested Overall Rating (1-5) with justification

Be specific and cite concrete examples from the notes. Avoid speculation. Tone: professional, growth-oriented.

Inputs:
${summary}`;

    const { text } = await generateText({ model: gateway()(MODEL), prompt });

    await context.supabase
      .from("performance_reviews")
      .update({ ai_draft: text, ai_generated_at: new Date().toISOString() })
      .eq("id", data.review_id);

    await context.supabase.rpc("record_audit_event" as never, {
      _action: "ai_draft_review", _entity: "performance_review", _entity_id: data.review_id,
      _diff: { sessions: ctx.sessions.length, goals: ctx.goals.length },
    } as never);

    return { draft: text };
  });

export const updateReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      review_id: z.string().uuid(),
      patch: z.object({
        manager_narrative: z.string().max(20000).optional(),
        employee_self_assessment: z.string().max(20000).optional(),
        overall_rating: z.number().int().min(1).max(5).optional(),
        ratings: z.record(z.string(), z.unknown()).optional(),
        status: z.enum(["draft", "manager_complete", "employee_acknowledged", "finalized"]).optional(),
      }),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("performance_reviews")
      .update(data.patch as never)
      .eq("id", data.review_id);
    if (error) throw new Error(error.message);
    await context.supabase.rpc("record_audit_event" as never, {
      _action: "update", _entity: "performance_review", _entity_id: data.review_id,
      _diff: data.patch as never,
    } as never);
    return { ok: true };
  });

export const signReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      review_id: z.string().uuid(),
      signer_role: z.enum(["manager", "employee", "hr"]),
      signature_text: z.string().max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("performance_review_signatures").insert({
      review_id: data.review_id,
      signer_user_id: context.userId,
      signer_role: data.signer_role,
      signature_text: data.signature_text ?? null,
    });
    if (error) throw new Error(error.message);
    await context.supabase.rpc("record_audit_event" as never, {
      _action: "sign", _entity: "performance_review", _entity_id: data.review_id,
      _diff: { role: data.signer_role },
    } as never);
    return { ok: true };
  });