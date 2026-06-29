import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Returns open-task counts per direct report for the signed-in user.
 * Authorization: only counts employees whose `manager_id` resolves to an
 * `employees` row whose `user_id` equals the caller, OR the caller is HR admin.
 */
export const getDirectReportTaskCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ employee_ids: z.array(z.string().uuid()) }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.employee_ids.length === 0) return { counts: {} as Record<string, { onboarding: number; training: number; leave: number }> };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve caller's employee id
    const { data: meRow } = await supabaseAdmin.from("employees").select("id").eq("user_id", context.userId).maybeSingle();
    const myEmpId = meRow?.id as string | undefined;

    // HR admin bypass
    const { data: roleRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "hr_admin").maybeSingle();
    const isHr = !!roleRow;

    // Filter to authorized employee ids
    let allowed: string[] = [];
    if (isHr) {
      allowed = data.employee_ids;
    } else if (myEmpId) {
      const { data: mine } = await supabaseAdmin
        .from("employees")
        .select("id")
        .eq("manager_id", myEmpId)
        .in("id", data.employee_ids);
      allowed = (mine ?? []).map((r) => r.id as string);
    }
    if (allowed.length === 0) return { counts: {} };

    const counts: Record<string, { onboarding: number; training: number; leave: number }> = {};
    for (const id of allowed) counts[id] = { onboarding: 0, training: 0, leave: 0 };

    // Onboarding tasks not complete (via onboarding_instances → task_instances)
    const { data: instances } = await supabaseAdmin
      .from("onboarding_instances")
      .select("id, employee_id")
      .in("employee_id", allowed);
    const instById: Record<string, string> = {};
    for (const r of instances ?? []) instById[r.id as string] = r.employee_id as string;
    if (Object.keys(instById).length) {
      const { data: tasks } = await supabaseAdmin
        .from("task_instances")
        .select("onboarding_instance_id, status")
        .in("onboarding_instance_id", Object.keys(instById))
        .neq("status", "complete");
      for (const t of tasks ?? []) {
        const empId = instById[t.onboarding_instance_id as string];
        if (empId && counts[empId]) counts[empId].onboarding += 1;
      }
    }

    // Training due within 7 days or overdue, not complete
    const horizon = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    const { data: training } = await supabaseAdmin
      .from("employee_training")
      .select("employee_id, status, due_date")
      .in("employee_id", allowed)
      .in("status", ["assigned", "in_progress"])
      .lte("due_date", horizon);
    for (const t of training ?? []) {
      const empId = t.employee_id as string;
      if (counts[empId]) counts[empId].training += 1;
    }

    // Pending leave requests
    const { data: leave } = await supabaseAdmin
      .from("leave_requests")
      .select("employee_id, status")
      .in("employee_id", allowed)
      .eq("status", "pending");
    for (const l of leave ?? []) {
      const empId = l.employee_id as string;
      if (counts[empId]) counts[empId].leave += 1;
    }

    return { counts };
  });