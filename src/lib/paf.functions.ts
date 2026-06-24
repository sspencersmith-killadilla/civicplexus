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

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const isHrAdmin = roles.includes("hr_admin");
    const isSupervisor = roles.includes("supervisor");
    const isHiringMgr = roles.includes("hiring_manager");
    if (!isHrAdmin && !isSupervisor && !isHiringMgr) {
      throw new Error("Forbidden: only HR admins, supervisors, or hiring managers can submit PAFs");
    }
    const { data: emp } = await supabaseAdmin
      .from("employees")
      .select("id, manager_id, user_id")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (!emp) throw new Error("Employee not found");
    if (emp.user_id === context.userId) {
      throw new Error("Cannot submit a PAF on yourself");
    }
    if (!isHrAdmin) {
      const managerEmpRow = await supabaseAdmin
        .from("employees").select("user_id").eq("id", emp.manager_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
      const isDirectManager = managerEmpRow.data?.user_id === context.userId;
      if (!isDirectManager) {
        throw new Error("Forbidden: you may only submit PAFs for employees you directly manage");
      }
    }

    // Resolve the subject employee's manager user_id (for stage-1 supervisor step)
    let managerUserId: string | null = null;
    if (emp.manager_id) {
      const { data: m } = await supabaseAdmin
        .from("employees").select("user_id").eq("id", emp.manager_id).maybeSingle();
      managerUserId = m?.user_id ?? null;
    }
    // Fallback admin from org_settings
    const { data: org } = await supabaseAdmin.from("org_settings").select("fallback_admin_user_id").maybeSingle();
    const fallbackAdmin = (org as { fallback_admin_user_id: string | null } | null)?.fallback_admin_user_id ?? null;

    const chainKind = `paf_${data.action_type}`;
    const { data: chain, error: cErr } = await supabaseAdmin
      .from("approval_chains")
      .insert({ kind: chainKind, created_by: context.userId, status: "pending" } as never)
      .select("id").single();
    if (cErr || !chain) throw new Error(cErr?.message ?? "Could not start chain");

    // Action-aware default chain
    const defaultChainsByAction: Record<string, Array<"supervisor"|"hr_admin"|"hiring_manager"|"it_admin">> = {
      hire: ["hr_admin"],
      rehire: ["hr_admin"],
      separation: ["supervisor","hr_admin"],
      transfer: ["supervisor","hr_admin"],
      position_change: ["supervisor","hr_admin"],
      promotion: ["supervisor","hr_admin"],
      demotion: ["supervisor","hr_admin"],
      pay_change: ["supervisor","hr_admin"],
      reclassification: ["supervisor","hr_admin"],
      status_change: ["supervisor","hr_admin"],
      leave_start: ["supervisor","hr_admin"],
      leave_return: ["supervisor","hr_admin"],
      other: ["supervisor","hr_admin"],
    };
    const approvalRoles = data.approval_roles ?? defaultChainsByAction[data.action_type] ?? ["supervisor","hr_admin"];

    // Find first hr_admin user id for assignment
    const { data: hrUsers } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "hr_admin" as never);
    const firstHr = (hrUsers ?? [])[0]?.user_id ?? null;

    const resolveApproverId = (role: string): string | null => {
      if (role === "supervisor") return managerUserId ?? fallbackAdmin;
      if (role === "hr_admin") return firstHr ?? fallbackAdmin;
      return fallbackAdmin;
    };

    for (let i = 0; i < approvalRoles.length; i++) {
      const role = approvalRoles[i];
      const approverId = resolveApproverId(role);
      await supabaseAdmin.from("approval_steps").insert({
        chain_id: chain.id, stage: i + 1, approver_role: role,
        approver_id: approverId, status: "pending",
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

    // Notify the specific stage-1 approver if known; else role pool
    const { data: firstStep } = await supabaseAdmin
      .from("approval_steps").select("approver_role, approver_id")
      .eq("chain_id", chain.id).eq("stage", 1).maybeSingle();
    const recipients: string[] = [];
    if (firstStep?.approver_id) recipients.push(firstStep.approver_id as string);
    else if (firstStep?.approver_role) {
      const { data: pool } = await supabaseAdmin
        .from("user_roles").select("user_id").eq("role", firstStep.approver_role as "hr_admin");
      for (const a of pool ?? []) recipients.push(a.user_id);
    }
    for (const uid of recipients) {
      await supabaseAdmin.from("notifications").insert({
        user_id: uid, type: "paf_approval",
        title: `PAF ${paf.paf_number} needs approval`,
        body: `${data.action_type.replace(/_/g, " ")} effective ${data.effective_date}`,
        link: `/paf/${paf.id}`,
      } as never);
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

    const after = (paf.after_values ?? {}) as Record<string, unknown>;
    const allowed = new Set([
      "job_title","department","status","position_id","manager_id",
      "start_date","end_date","work_email",
      "separation_date","separation_reason","rehire_eligible",
    ]);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(after)) if (allowed.has(k)) patch[k] = v;

    // Action-driven side effects
    if (paf.action_type === "separation") {
      patch.status = "offboarded";
      patch.separation_date = patch.separation_date ?? paf.effective_date;
      if (patch.rehire_eligible === undefined) patch.rehire_eligible = true;
    } else if (paf.action_type === "leave_start") {
      patch.status = "on_leave";
    } else if (paf.action_type === "leave_return") {
      patch.status = "active";
    } else if (paf.action_type === "rehire") {
      patch.status = "active";
      patch.separation_date = null;
      patch.separation_reason = null;
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("employees").update(patch as never).eq("id", paf.employee_id);
      if (error) throw new Error(error.message);
    }

    // Side-effects: separation seeds offboarding instance + cancels future training
    if (paf.action_type === "separation") {
      const { data: tpl } = await supabaseAdmin
        .from("onboarding_templates").select("id")
        .eq("template_type", "offboarding").eq("is_active", true).limit(1).maybeSingle();
      if (tpl) {
        const { data: inst } = await supabaseAdmin
          .from("onboarding_instances").insert({ employee_id: paf.employee_id, template_id: tpl.id } as never)
          .select("id").single();
        if (inst) {
          const { data: tasks } = await supabaseAdmin
            .from("template_tasks").select("*").eq("template_id", tpl.id).order("sort_order");
          for (const t of tasks ?? []) {
            await supabaseAdmin.from("task_instances").insert({
              onboarding_instance_id: inst.id, template_task_id: t.id,
              title: t.title, description: t.description, category: t.category,
              assignee: t.assignee, is_required: t.is_required, sort_order: t.sort_order,
            } as never);
          }
        }
      }
      await supabaseAdmin.from("employee_training")
        .update({ status: "cancelled" } as never)
        .eq("employee_id", paf.employee_id)
        .eq("status", "assigned");
    }

    await supabaseAdmin.from("personnel_actions").update({
      status: "applied", applied_at: new Date().toISOString(), applied_by: context.userId,
    } as never).eq("id", data.id);

    await supabaseAdmin.from("audit_events").insert({
      actor_id: context.userId, action: "paf_applied", entity: "personnel_action", entity_id: data.id,
      diff: { action_type: paf.action_type, employee_id: paf.employee_id, patch },
    } as never);

    return { ok: true };
  });

// Start an offboarding: creates a separation PAF (auto-resolves approvers + fallback admin)

// HR-only: change the org's fallback admin
export const setFallbackAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR admin only");
    const { error } = await supabaseAdmin.from("org_settings").update({ fallback_admin_user_id: data.user_id } as never).neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(error.message);
    return { ok: true };
  });