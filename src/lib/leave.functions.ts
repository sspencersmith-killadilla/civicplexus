import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitInput = z.object({
  employee_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_hours: z.number().min(0.25).max(2000),
  is_intermittent: z.boolean().optional(),
  reason: z.string().max(2000).optional(),
  fmla_case_id: z.string().uuid().optional(),
});

export const submitLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as never as typeof import("@supabase/supabase-js")["createClient"] extends never ? never : ReturnType<typeof import("@supabase/supabase-js").createClient>;
    const { data: row, error } = await (sb as never as { from: (t: string) => { insert: (v: unknown) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } } } })
      .from("leave_requests")
      .insert({
        employee_id: data.employee_id,
        plan_id: data.plan_id,
        start_date: data.start_date,
        end_date: data.end_date,
        total_hours: data.total_hours,
        is_intermittent: data.is_intermittent ?? false,
        reason: data.reason ?? null,
        fmla_case_id: data.fmla_case_id ?? null,
        status: "submitted",
        submitted_by: context.userId,
      })
      .select("id").single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");

    // Bump pending_hours on the balance row (best-effort, ignore if no row yet)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bal } = await supabaseAdmin
      .from("leave_balances").select("id, pending_hours")
      .eq("employee_id", data.employee_id).eq("plan_id", data.plan_id).maybeSingle();
    if (bal) {
      await supabaseAdmin.from("leave_balances")
        .update({ pending_hours: Number(bal.pending_hours) + data.total_hours } as never)
        .eq("id", bal.id);
    }

    // Notify supervisor
    const { data: emp } = await supabaseAdmin.from("employees").select("manager_id, first_name, last_name").eq("id", data.employee_id).maybeSingle();
    if (emp?.manager_id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: emp.manager_id, type: "leave_request",
        title: "Leave request to review",
        body: `${emp.first_name} ${emp.last_name} requested ${data.total_hours}h leave`,
        link: `/leave/${row.id}`,
      } as never);
    }
    return { id: row.id };
  });

const decideInput = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "denied", "cancelled"]),
  notes: z.string().max(2000).optional(),
});

export const decideLeaveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decideInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req, error: rErr } = await supabaseAdmin
      .from("leave_requests").select("*").eq("id", data.id).maybeSingle();
    if (rErr || !req) throw new Error("Request not found");

    // Authorize: HR or direct manager or the submitter cancelling
    const { data: emp } = await supabaseAdmin.from("employees").select("manager_id, user_id, first_name, last_name").eq("id", req.employee_id).maybeSingle();
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const isHR = (roles ?? []).some((r) => r.role === "hr_admin");
    const isMgr = emp?.manager_id === context.userId;
    const isSelfCancel = data.decision === "cancelled" && emp?.user_id === context.userId;
    if (!isHR && !isMgr && !isSelfCancel) throw new Error("Not authorized");

    await supabaseAdmin.from("leave_requests").update({
      status: data.decision,
      decided_by: context.userId,
      decided_at: new Date().toISOString(),
      decision_notes: data.notes ?? null,
    } as never).eq("id", data.id);

    // Move pending → used on approve; release pending on deny/cancel
    const { data: bal } = await supabaseAdmin
      .from("leave_balances").select("id, pending_hours, used_hours")
      .eq("employee_id", req.employee_id).eq("plan_id", req.plan_id).maybeSingle();
    if (bal) {
      const pend = Math.max(0, Number(bal.pending_hours) - Number(req.total_hours));
      const used = data.decision === "approved" ? Number(bal.used_hours) + Number(req.total_hours) : Number(bal.used_hours);
      await supabaseAdmin.from("leave_balances").update({ pending_hours: pend, used_hours: used } as never).eq("id", bal.id);
    }

    // Notify employee
    if (emp?.user_id && !isSelfCancel) {
      await supabaseAdmin.from("notifications").insert({
        user_id: emp.user_id, type: "leave_request",
        title: `Leave ${data.decision}`,
        body: data.notes ?? `Your leave request was ${data.decision}.`,
        link: `/leave/${data.id}`,
      } as never);
    }
    return { ok: true };
  });

// Manual accrual run — HR-triggered. Uses the same shared logic as the pg_cron endpoint.
export const runMonthlyAccruals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR admin only");
    const { runLeaveAccruals } = await import("@/lib/leave-accruals.server");
    return await runLeaveAccruals(supabaseAdmin);
  });

// Preview an accrual run for a given month (YYYY-MM) without writing changes.
const simInput = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

export const simulateAccruals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => simInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR admin only");
    const { runLeaveAccruals } = await import("@/lib/leave-accruals.server");
    // Use the 1st of the selected month at 02:00 UTC — matches the cron schedule.
    const [y, m] = data.month.split("-").map(Number);
    const now = new Date(Date.UTC(y, m - 1, 1, 2, 0, 0));
    return await runLeaveAccruals(supabaseAdmin, { now, dryRun: true });
  });