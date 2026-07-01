import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  resolveApprovalChain,
  computeApplyPatch,
  computeApplySideEffects,
  type ApprovalRole,
  type PafActionType,
} from "@/lib/paf-logic";

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
    const isDeptAdmin = roles.includes("department_admin");
    if (!isHrAdmin && !isSupervisor && !isHiringMgr && !isDeptAdmin) {
      throw new Error("Forbidden: only HR admins, supervisors, hiring managers, or department admins can submit PAFs");
    }
    const { data: emp } = await supabaseAdmin
      .from("employees")
      .select("id, manager_id, user_id, department")
      .eq("id", data.employee_id)
      .maybeSingle();
    if (!emp) throw new Error("Employee not found");
    if (emp.user_id === context.userId) {
      throw new Error("Cannot submit a PAF on yourself");
    }
    if (!isHrAdmin) {
      const { data: meEmp } = await supabaseAdmin
        .from("employees").select("id").eq("user_id", context.userId).maybeSingle();
      const isDirectManager = !!meEmp && emp.manager_id === (meEmp as { id: string }).id;
      let isDeptAdminForTarget = false;
      if (isDeptAdmin && emp.department) {
        const { data: da } = await supabaseAdmin
          .from("department_admins")
          .select("department")
          .eq("user_id", context.userId)
          .eq("department", emp.department)
          .maybeSingle();
        isDeptAdminForTarget = !!da;
      }
      if (!isDirectManager && !isDeptAdminForTarget) {
        throw new Error("Forbidden: you may only submit PAFs for employees you directly manage or in a department you administer");
      }
    }

    // employees.manager_id references public.employees(id) — resolve to the supervisor's auth user_id.
    let managerUserId: string | null = null;
    if (emp.manager_id) {
      const { data: mgr } = await supabaseAdmin
        .from("employees").select("user_id").eq("id", emp.manager_id).maybeSingle();
      managerUserId = (mgr as { user_id: string | null } | null)?.user_id ?? null;
    }
    // Fallback admin from org_settings
    const { data: org } = await supabaseAdmin.from("org_settings").select("fallback_admin_user_id").maybeSingle();
    const fallbackAdmin = (org as { fallback_admin_user_id: string | null } | null)?.fallback_admin_user_id ?? null;

    // Find first hr_admin user id for assignment
    const { data: hrUsers } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "hr_admin" as never)
      .order("created_at", { ascending: true });
    const firstHr = isHrAdmin
      ? context.userId
      : (hrUsers ?? [])[0]?.user_id ?? null;

    const steps = resolveApprovalChain({
      action_type: data.action_type as PafActionType,
      override_roles: data.approval_roles as ApprovalRole[] | undefined,
      manager_user_id: managerUserId,
      first_hr_user_id: firstHr,
      fallback_admin_user_id: fallbackAdmin,
    });

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
      } as never)
      .select("id, paf_number").single();
    if (pErr || !paf) throw new Error(pErr?.message ?? "PAF create failed");

    let chainId: string | null = null;
    try {
      const chainKind = `paf_${data.action_type}`;
      const { data: chain, error: cErr } = await supabaseAdmin
        .from("approval_chains")
        .insert({
          kind: chainKind,
          entity_type: "personnel_action",
          entity_id: paf.id,
          created_by: context.userId,
          status: "pending",
        } as never)
        .select("id").single();
      if (cErr || !chain) throw new Error(cErr?.message ?? "Could not start chain");
      chainId = chain.id;

      for (const step of steps) {
        const label = step.role.replace(/_/g, " ");
        const { error: sErr } = await supabaseAdmin.from("approval_steps").insert({
          chain_id: chainId,
          stage: step.stage,
          approver_role: step.role,
          approver_label: label,
          approver_id: step.approver_id,
          status: "pending",
        } as never);
        if (sErr) throw new Error(`Could not create approval step (stage ${step.stage}): ${sErr.message}`);
      }

      const { error: linkErr } = await supabaseAdmin.from("personnel_actions")
        .update({ approval_chain_id: chainId } as never).eq("id", paf.id);
      if (linkErr) throw new Error(`Could not link approval chain: ${linkErr.message}`);
    } catch (error) {
      if (chainId) await supabaseAdmin.from("approval_chains").delete().eq("id", chainId);
      await supabaseAdmin.from("paf_audit").delete().eq("paf_id", paf.id);
      await supabaseAdmin.from("personnel_actions").delete().eq("id", paf.id);
      throw error;
    }

    // Notify the specific stage-1 approver if known; else role pool
    const { data: firstStep } = await supabaseAdmin
        .from("approval_steps").select("approver_role, approver_id")
        .eq("chain_id", chainId).eq("stage", 1).maybeSingle();
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

    const patch = computeApplyPatch({
      action_type: paf.action_type as PafActionType,
      after_values: (paf.after_values ?? {}) as Record<string, unknown>,
      effective_date: paf.effective_date as string,
    });
    const sideEffects = computeApplySideEffects(paf.action_type as PafActionType);

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("employees").update(patch as never).eq("id", paf.employee_id);
      if (error) throw new Error(error.message);
    }

    if (sideEffects.seed_offboarding_checklist) {
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
    }
    if (sideEffects.cancel_future_training) {
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

export const getPafDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const isHrAdmin = roles.includes("hr_admin");

    const { data: paf, error: pafError } = await supabaseAdmin
      .from("personnel_actions")
      .select("*, employees(first_name, last_name, job_title, department, user_id, manager_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (pafError) throw new Error(pafError.message);
    if (!paf) throw new Error("PAF not found");

    let chainId = paf.approval_chain_id as string | null;
    if (!chainId) {
      const { data: chain } = await supabaseAdmin
        .from("approval_chains")
        .select("id")
        .eq("entity_type", "personnel_action")
        .eq("entity_id", data.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      chainId = chain?.id ?? null;
    }
    const { data: steps, error: stepsError } = chainId
      ? await supabaseAdmin
          .from("approval_steps")
          .select("id, stage, approver_role, approver_label, approver_id, status, decided_at, decision_notes")
          .eq("chain_id", chainId)
          .order("stage")
      : { data: [], error: null };
    if (stepsError) throw new Error(stepsError.message);

    const employee = paf.employees as { user_id: string | null; manager_id: string | null } | null;
    const canView =
      isHrAdmin ||
      paf.initiated_by === context.userId ||
      employee?.user_id === context.userId ||
      employee?.manager_id === context.userId ||
      (steps ?? []).some((s) => s.approver_id === context.userId || (s.approver_role && roles.includes(s.approver_role)));

    if (!canView) throw new Error("Forbidden");

    const { data: auditRows, error: auditError } = await supabaseAdmin
      .from("paf_audit")
      .select("id, event_type, from_status, to_status, notes, payload, created_at, actor_id")
      .eq("paf_id", data.id)
      .order("created_at", { ascending: false });
    if (auditError) throw new Error(auditError.message);

    const actorIds = Array.from(new Set((auditRows ?? []).map((r) => r.actor_id).filter(Boolean) as string[]));
    const nameMap: Record<string, string> = {};
    if (actorIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      for (const profile of profiles ?? []) {
        nameMap[profile.id] = profile.full_name || profile.email || profile.id.slice(0, 8);
      }
    }

    return {
      paf: {
        id: paf.id,
        paf_number: paf.paf_number,
        action_type: paf.action_type,
        effective_date: paf.effective_date,
        status: paf.status,
        reason: paf.reason,
        narrative: paf.narrative,
        before_values: paf.before_values ?? {},
        after_values: paf.after_values ?? {},
        approval_chain_id: chainId,
        employees: paf.employees,
      },
      steps: (steps ?? []).map((s) => ({
        id: s.id,
        stage: s.stage,
        approver_role: s.approver_role,
        approver_label: s.approver_label,
        approver_id: s.approver_id,
        status: s.status,
        decided_at: s.decided_at,
        decision_notes: s.decision_notes,
        can_decide: isHrAdmin || s.approver_id === context.userId || (!!s.approver_role && roles.includes(s.approver_role)),
      })),
      audit: (auditRows ?? []).map((r) => ({
        ...r,
        actor_name: r.actor_id ? (nameMap[r.actor_id] ?? r.actor_id.slice(0, 8)) : "System",
      })),
      viewer: { is_hr_admin: isHrAdmin },
    };
  });

export const decidePafStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    step_id: z.string().uuid(),
    decision: z.enum(["approved", "denied"]),
    notes: z.string().max(4000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("decide_paf_step" as never, {
      _step_id: data.step_id,
      _decision: data.decision,
      _notes: data.notes ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getApprovalInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const isHrAdmin = roles.includes("hr_admin");

    const { data: stepRows, error: stepError } = await supabaseAdmin
      .from("approval_steps")
      .select("id, stage, approver_label, approver_role, approver_id, status, chain_id, created_at")
      .eq("status", "pending")
      .order("created_at");
    if (stepError) throw new Error(stepError.message);

    const visibleSteps = (stepRows ?? []).filter((step) =>
      isHrAdmin || step.approver_id === context.userId || (!!step.approver_role && roles.includes(step.approver_role)),
    );
    const chainIds = Array.from(new Set(visibleSteps.map((step) => step.chain_id).filter(Boolean) as string[]));

    const chainMap: Record<string, { id: string; kind: string | null; entity_type: string | null; entity_id: string | null; status: string | null }> = {};
    if (chainIds.length) {
      const { data: chains, error: chainError } = await supabaseAdmin
        .from("approval_chains")
        .select("id, kind, entity_type, entity_id, status")
        .in("id", chainIds);
      if (chainError) throw new Error(chainError.message);
      for (const chain of chains ?? []) chainMap[chain.id] = chain;
    }

    const pafChainIds = chainIds.filter((chainId) => {
      const chain = chainMap[chainId];
      return (chain?.kind ?? "").startsWith("paf_") || chain?.entity_type === "personnel_action";
    });
    const pafMap: Record<string, { id: string; paf_number: string | null; action_type: string }> = {};
    if (pafChainIds.length) {
      const { data: pafs, error: pafError } = await supabaseAdmin
        .from("personnel_actions")
        .select("id, paf_number, action_type, approval_chain_id")
        .in("approval_chain_id", pafChainIds);
      if (pafError) throw new Error(pafError.message);
      for (const paf of pafs ?? []) {
        if (paf.approval_chain_id) {
          pafMap[paf.approval_chain_id] = {
            id: paf.id,
            paf_number: paf.paf_number,
            action_type: paf.action_type,
          };
        }
      }
    }

    return visibleSteps.map((step) => ({
      id: step.id,
      stage: step.stage,
      approver_label: step.approver_label,
      approver_role: step.approver_role,
      chain_id: step.chain_id,
      approval_chains: chainMap[step.chain_id] ?? null,
      paf: pafMap[step.chain_id] ?? null,
    }));
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

// HR-only: rebuild missing/incomplete approval chains for existing PAFs.
// Idempotent: scans every PAF in draft/pending_approval status and ensures it
// has an approval_chains row plus a full set of approval_steps derived from
// the PAF's action_type, the employee's current manager, and the configured
// fallback admin. Useful after migrations or partial submit failures left
// PAFs un-approvable.
export const repairPafChains = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR admin only");

    const { data: org } = await supabaseAdmin.from("org_settings").select("fallback_admin_user_id").maybeSingle();
    const fallbackAdmin = (org as { fallback_admin_user_id: string | null } | null)?.fallback_admin_user_id ?? null;
    const { data: hrUsers } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "hr_admin" as never).order("created_at", { ascending: true });
    const firstHr = (hrUsers ?? [])[0]?.user_id ?? null;

    const { data: pafs, error } = await supabaseAdmin
      .from("personnel_actions")
      .select("id, action_type, employee_id, approval_chain_id, initiated_by, status")
      .in("status", ["draft", "pending_approval"]);
    if (error) throw new Error(error.message);

    let repaired = 0;
    let alreadyOk = 0;
    const problems: Array<{ paf_id: string; reason: string }> = [];

    for (const paf of pafs ?? []) {
      // Resolve manager from the employee
      const { data: emp } = await supabaseAdmin
        .from("employees").select("manager_id").eq("id", paf.employee_id).maybeSingle();
      const managerUserId = (emp as { manager_id: string | null } | null)?.manager_id ?? null;

      const steps = resolveApprovalChain({
        action_type: paf.action_type as PafActionType,
        manager_user_id: managerUserId,
        first_hr_user_id: firstHr,
        fallback_admin_user_id: fallbackAdmin,
      });

      // Ensure a chain row exists
      let chainId = paf.approval_chain_id as string | null;
      if (!chainId) {
        const { data: chain, error: cErr } = await supabaseAdmin
          .from("approval_chains").insert({
            kind: `paf_${paf.action_type}`,
            entity_type: "personnel_action",
            entity_id: paf.id,
            created_by: paf.initiated_by ?? context.userId,
            status: "pending",
          } as never).select("id").single();
        if (cErr || !chain) { problems.push({ paf_id: paf.id, reason: cErr?.message ?? "chain insert failed" }); continue; }
        chainId = chain.id;
        await supabaseAdmin.from("personnel_actions").update({ approval_chain_id: chainId } as never).eq("id", paf.id);
      }

      // Check existing steps; rebuild only when missing or count mismatches expected
      const { data: existing } = await supabaseAdmin
        .from("approval_steps").select("id, stage, approver_role, approver_id, status")
        .eq("chain_id", chainId).order("stage");
      const need = steps.length;
      const have = existing ?? [];
      const decided = have.some((s) => s.status !== "pending");
      const stageMismatch = have.length !== need;
      const emptyRoles = have.some((s) => !s.approver_role);
      const missingApprover = have.some((s) => !s.approver_id);

      if (!stageMismatch && !emptyRoles && !missingApprover) { alreadyOk++; continue; }
      if (decided) { problems.push({ paf_id: paf.id, reason: "has decided steps; skipped" }); continue; }

      // Wipe pending steps and reinsert clean ones
      await supabaseAdmin.from("approval_steps").delete().eq("chain_id", chainId);
      let stepErr: string | null = null;
      for (const step of steps) {
        const { error: sErr } = await supabaseAdmin.from("approval_steps").insert({
          chain_id: chainId,
          stage: step.stage,
          approver_role: step.role,
          approver_label: step.role.replace(/_/g, " "),
          approver_id: step.approver_id,
          status: "pending",
        } as never);
        if (sErr) { stepErr = sErr.message; break; }
      }
      if (stepErr) { problems.push({ paf_id: paf.id, reason: stepErr }); continue; }
      repaired++;
    }

    return { scanned: (pafs ?? []).length, repaired, alreadyOk, problems };
  });