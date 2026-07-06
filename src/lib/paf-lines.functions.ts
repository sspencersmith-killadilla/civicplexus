import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ACTION_TYPES = [
  "hire","rehire","transfer","promotion","demotion","reclassification",
  "pay_change","status_change","leave_start","leave_return","separation","position_change","other",
] as const;

export const listPafLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ paf_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lines, error } = await supabaseAdmin
      .from("paf_action_lines")
      .select("id, ordinal, action_type, effective_date, before_values, after_values, status, applied_at")
      .eq("paf_id", data.paf_id)
      .order("ordinal");
    if (error) throw new Error(error.message);
    const lineIds = (lines ?? []).map((l) => l.id);
    const { data: votes } = lineIds.length
      ? await supabaseAdmin
          .from("approval_step_line_votes")
          .select("id, step_id, line_id, decision, note, decided_by, decided_at")
          .in("line_id", lineIds)
      : { data: [] };
    return { lines: lines ?? [], votes: votes ?? [] };
  });

export const addPafLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    paf_id: z.string().uuid(),
    action_type: z.enum(ACTION_TYPES),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    after_values: z.record(z.string(), z.unknown()).default({}),
    before_values: z.record(z.string(), z.unknown()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: paf } = await supabaseAdmin.from("personnel_actions").select("id, initiated_by, status").eq("id", data.paf_id).maybeSingle();
    if (!paf) throw new Error("PAF not found");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const isHr = (roles ?? []).some((r) => r.role === "hr_admin");
    if (!isHr && paf.initiated_by !== context.userId) throw new Error("Forbidden");
    if (!["draft", "pending_approval"].includes(paf.status)) throw new Error("PAF is no longer editable");
    const { data: last } = await supabaseAdmin
      .from("paf_action_lines").select("ordinal").eq("paf_id", data.paf_id).order("ordinal", { ascending: false }).limit(1).maybeSingle();
    const nextOrdinal = ((last as { ordinal: number } | null)?.ordinal ?? 0) + 1;
    const { data: ins, error } = await supabaseAdmin.from("paf_action_lines").insert({
      paf_id: data.paf_id, ordinal: nextOrdinal,
      action_type: data.action_type, effective_date: data.effective_date,
      before_values: data.before_values, after_values: data.after_values, status: "pending",
    } as never).select("id").single();
    if (error) throw new Error(error.message);
    return ins;
  });

export const deletePafLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: line } = await supabaseAdmin.from("paf_action_lines").select("paf_id").eq("id", data.id).maybeSingle();
    if (!line) return { ok: true };
    const { data: paf } = await supabaseAdmin.from("personnel_actions").select("initiated_by, status").eq("id", line.paf_id).maybeSingle();
    if (!paf) throw new Error("PAF not found");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const isHr = (roles ?? []).some((r) => r.role === "hr_admin");
    if (!isHr && paf.initiated_by !== context.userId) throw new Error("Forbidden");
    if (!["draft", "pending_approval"].includes(paf.status)) throw new Error("PAF is no longer editable");
    const { error } = await supabaseAdmin.from("paf_action_lines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const castLineVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    step_id: z.string().uuid(),
    line_id: z.string().uuid(),
    decision: z.enum(["approved", "denied"]),
    note: z.string().max(2000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: step } = await supabaseAdmin.from("approval_steps").select("id, approver_id, approver_role, status").eq("id", data.step_id).maybeSingle();
    if (!step) throw new Error("Step not found");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const roleList = (roles ?? []).map((r) => r.role as string);
    const isHr = roleList.includes("hr_admin");
    const canDecide = isHr || step.approver_id === context.userId || (step.approver_role && roleList.includes(step.approver_role));
    if (!canDecide) throw new Error("Forbidden");
    if (step.status !== "pending") throw new Error("Step already decided");
    const { error } = await supabaseAdmin.from("approval_step_line_votes").upsert({
      step_id: data.step_id, line_id: data.line_id, decision: data.decision,
      note: data.note ?? null, decided_by: context.userId, decided_at: new Date().toISOString(),
    } as never, { onConflict: "step_id,line_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });