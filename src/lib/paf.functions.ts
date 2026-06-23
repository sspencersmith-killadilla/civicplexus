import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createInput = z.object({
  employee_id: z.string().uuid(),
  action_type: z.enum([
    "hire","rehire","transfer","promotion","demotion","reclassification",
    "pay_change","status_change","leave_start","leave_return","separation","position_change","other",
  ]),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(1000).optional(),
  narrative: z.string().max(4000).optional(),
  before_values: z.record(z.string(), z.unknown()).optional(),
  after_values: z.record(z.string(), z.unknown()).optional(),
  approval_roles: z.array(z.enum(["supervisor","hiring_manager","hr_admin","it_admin"])).optional(),
});

export const submitPaf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const chainKind = `paf_${data.action_type}`;
    const { data: chain, error: cErr } = await supabaseAdmin
      .from("approval_chains")
      .insert({ kind: chainKind, created_by: context.userId, status: "pending" } as never)
      .select("id").single();
    if (cErr || !chain) throw new Error(cErr?.message ?? "Could not start chain");

    const roles = data.approval_roles ?? ["supervisor","hr_admin"];
    for (let i = 0; i < roles.length; i++) {
      await supabaseAdmin.from("approval_steps").insert({
        chain_id: chain.id, stage: i + 1, approver_role: roles[i], status: "pending",
      } as never);
    }

    const { data: paf, error: pErr } = await supabaseAdmin
      .from("personnel_actions")
      .insert({
        employee_id: data.employee_id,
        action_type: data.action_type,
        effective_date: data.effective_date,
        reason: data.reason ?? null,
        narrative: data.narrative ?? null,
        before_values: data.before_values ?? {},
        after_values: data.after_values ?? {},
        status: "pending_approval",
        initiated_by: context.userId,
        approval_chain_id: chain.id,
      } as never)
      .select("id, paf_number").single();
    if (pErr || !paf) throw new Error(pErr?.message ?? "PAF create failed");

    // Notify first approver pool
    const { data: firstStep } = await supabaseAdmin
      .from("approval_steps").select("approver_role")
      .eq("chain_id", chain.id).eq("stage", 1).maybeSingle();
    if (firstStep?.approver_role) {
      const { data: approvers } = await supabaseAdmin
        .from("user_roles").select("user_id").eq("role", firstStep.approver_role);
      for (const a of approvers ?? []) {
        await supabaseAdmin.from("notifications").insert({
          user_id: a.user_id, type: "paf_approval",
          title: `PAF ${paf.paf_number} needs approval`,
          body: `${data.action_type.replace(/_/g, " ")} effective ${data.effective_date}`,
          link: `/paf/${paf.id}`,
        } as never);
      }
    }
    return { id: paf.id, paf_number: paf.paf_number };
  });

export const applyPaf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR admin only");
    const { data: paf } = await supabaseAdmin.from("personnel_actions").select("*").eq("id", data.id).maybeSingle();
    if (!paf) throw new Error("PAF not found");
    if (paf.status !== "approved") throw new Error("PAF must be approved before applying");

    // Apply known fields to the employee record
    const after = (paf.after_values ?? {}) as Record<string, unknown>;
    const allowed = new Set(["job_title","department","status","position_id","manager_id","start_date","work_email"]);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(after)) if (allowed.has(k)) patch[k] = v;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("employees").update(patch as never).eq("id", paf.employee_id);
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("personnel_actions").update({
      status: "applied", applied_at: new Date().toISOString(), applied_by: context.userId,
    } as never).eq("id", data.id);
    return { ok: true };
  });