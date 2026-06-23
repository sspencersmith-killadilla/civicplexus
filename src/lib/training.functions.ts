import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const assignInput = z.object({
  course_id: z.string().uuid(),
  employee_ids: z.array(z.string().uuid()).min(1).max(500),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(1000).optional(),
});

const assignByWorkerTypeInput = z.object({
  course_id: z.string().uuid(),
  worker_type_id: z.string().uuid(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(1000).optional(),
});

const completeInput = z.object({
  training_id: z.string().uuid(),
  score: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).optional(),
});

async function authorize(userId: string, employeeIds: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const r = ((roles ?? []) as Array<{ role: string }>).map((x) => x.role);
  const isHr = r.includes("hr_admin") || r.includes("hiring_manager");
  if (isHr) return;
  if (!r.includes("supervisor")) throw new Error("Not authorized to assign training");
  const { data: emps } = await supabaseAdmin.from("employees").select("id,manager_id").in("id", employeeIds);
  const list = (emps ?? []) as Array<{ id: string; manager_id: string | null }>;
  const bad = list.some((e) => e.manager_id !== userId);
  if (bad || list.length !== employeeIds.length) throw new Error("Some employees are not your direct reports");
}

export const assignTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignInput.parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context.userId, data.employee_ids);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.employee_ids.map((employee_id) => ({
      employee_id,
      course_id: data.course_id,
      due_date: data.due_date ?? null,
      notes: data.notes ?? null,
      status: "assigned",
      assigned_by: context.userId,
    }));
    const { data: inserted, error } = await supabaseAdmin.from("employee_training").insert(rows as never).select("id,employee_id");
    if (error) throw new Error(error.message);

    // Notify each assigned employee (best-effort)
    const ids = (inserted ?? []).map((r: { employee_id: string }) => r.employee_id);
    if (ids.length) {
      const { data: emps } = await supabaseAdmin.from("employees").select("id,user_id").in("id", ids);
      const { data: course } = await supabaseAdmin.from("courses").select("name").eq("id", data.course_id).maybeSingle();
      const cname = (course as { name?: string } | null)?.name ?? "training";
      const notifs = (emps ?? [])
        .filter((e: { user_id: string | null }) => e.user_id)
        .map((e: { user_id: string | null }) => ({
          user_id: e.user_id as string,
          type: "training_assigned",
          title: `New training assigned: ${cname}`,
          body: data.due_date ? `Due by ${data.due_date}` : "Please complete at your convenience",
          link: "/my-hr",
        }));
      if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs as never);
    }
    return { assigned: inserted?.length ?? 0 };
  });

export const assignTrainingByWorkerType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignByWorkerTypeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const isHr = ((roles ?? []) as Array<{ role: string }>).some((r) => r.role === "hr_admin" || r.role === "hiring_manager");
    if (!isHr) throw new Error("Only HR can bulk-assign by worker type");
    const { data: emps } = await supabaseAdmin.from("employees").select("id").eq("worker_type_id", data.worker_type_id);
    const ids = ((emps ?? []) as Array<{ id: string }>).map((e) => e.id);
    if (!ids.length) return { assigned: 0 };
    return assignTraining({ data: { course_id: data.course_id, employee_ids: ids, due_date: data.due_date, notes: data.notes } });
  });

export const completeTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => completeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify caller owns this training row OR is hr/supervisor of the employee
    const { data: row } = await supabaseAdmin.from("employee_training").select("employee_id").eq("id", data.training_id).maybeSingle();
    const r = row as { employee_id: string } | null;
    if (!r) throw new Error("Training assignment not found");
    const { data: emp } = await supabaseAdmin.from("employees").select("user_id,manager_id").eq("id", r.employee_id).maybeSingle();
    const e = emp as { user_id: string | null; manager_id: string | null } | null;
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const roleNames = ((roles ?? []) as Array<{ role: string }>).map((x) => x.role);
    const isHr = roleNames.includes("hr_admin") || roleNames.includes("hiring_manager");
    const isOwner = e?.user_id === context.userId;
    const isMgr = e?.manager_id === context.userId;
    if (!isHr && !isOwner && !isMgr) throw new Error("Not authorized");
    const { error } = await supabaseAdmin.from("employee_training").update({
      status: "complete",
      completed_at: new Date().toISOString(),
      score: data.score ?? null,
      notes: data.notes ?? null,
    } as never).eq("id", data.training_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Called by the public reminders cron route. Idempotent per 24h via last_reminded_at. */
export async function dispatchTrainingReminders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);
  const dayAgo = new Date(Date.now() - 86400000).toISOString();

  const { data: rows } = await supabaseAdmin
    .from("employee_training")
    .select("id,due_date,last_reminded_at,status,courses(name),employees(user_id,manager_id,first_name,last_name)")
    .neq("status", "complete")
    .not("due_date", "is", null)
    .lt("due_date", today)
    .limit(1000);

  const notifs: Array<{ user_id: string; type: string; title: string; body: string; link: string }> = [];
  const reminded: string[] = [];
  for (const r of (rows ?? []) as Array<{
    id: string; due_date: string; last_reminded_at: string | null;
    courses: { name: string } | null;
    employees: { user_id: string | null; manager_id: string | null; first_name: string; last_name: string } | null;
  }>) {
    if (r.last_reminded_at && r.last_reminded_at > dayAgo) continue;
    const cname = r.courses?.name ?? "training";
    if (r.employees?.user_id) {
      notifs.push({
        user_id: r.employees.user_id,
        type: "training_overdue",
        title: `Overdue training: ${cname}`,
        body: `Was due ${r.due_date}`,
        link: "/my-hr",
      });
    }
    if (r.employees?.manager_id) {
      notifs.push({
        user_id: r.employees.manager_id,
        type: "training_overdue_report",
        title: `Direct report overdue: ${cname}`,
        body: `${r.employees.first_name} ${r.employees.last_name} — due ${r.due_date}`,
        link: "/training",
      });
    }
    reminded.push(r.id);
  }
  if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs as never);
  if (reminded.length) {
    await supabaseAdmin.from("employee_training").update({ last_reminded_at: new Date().toISOString() } as never).in("id", reminded);
  }
  return { reminded: reminded.length, notifications: notifs.length };
}