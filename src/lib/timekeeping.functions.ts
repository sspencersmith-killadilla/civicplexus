import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyRow = Record<string, unknown>;

function startOfWeek(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day); // ISO Monday start
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return s.toISOString().slice(0, 10);
}

export const getMyTimeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp } = await supabaseAdmin
      .from("employees")
      .select("id, first_name, last_name, worker_type_id, manager_id, status")
      .eq("user_id", context.userId).maybeSingle();
    if (!emp) return { employee: null };
    const [{ data: wt }, { data: open }, { data: sched }, { data: bal }, { data: pol }] = await Promise.all([
      emp.worker_type_id
        ? supabaseAdmin.from("worker_types").select("name, flsa_class").eq("id", emp.worker_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin.from("time_entries").select("*").eq("employee_id", emp.id).is("clock_out", null).maybeSingle(),
      supabaseAdmin.from("employee_schedules").select("*").eq("employee_id", emp.id)
        .order("effective_from", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("comp_time_balances").select("*").eq("employee_id", emp.id).maybeSingle(),
      supabaseAdmin.from("time_policies").select("*").eq("is_active", true).limit(1).maybeSingle(),
    ]);
    const weekStart = startOfWeek(new Date());
    const { data: weekEntries } = await supabaseAdmin
      .from("time_entries").select("clock_in, clock_out")
      .eq("employee_id", emp.id).gte("clock_in", weekStart);
    const weekMinutes = (weekEntries ?? []).reduce((acc, e) => {
      if (!e.clock_out) return acc;
      return acc + (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000;
    }, 0);
    return {
      employee: emp,
      worker_type: wt,
      open_entry: open,
      schedule: sched,
      comp_balance: bal,
      policy: pol,
      week_start: weekStart,
      week_minutes: Math.round(weekMinutes),
    };
  });

export const clockIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ note: z.string().max(500).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as { rpc: (n: string, a: AnyRow) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data: id, error } = await sb.rpc("clock_in", { _note: data.note ?? null });
    if (error) throw new Error(error.message);
    return { id };
  });

export const clockOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ note: z.string().max(500).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as { rpc: (n: string, a: AnyRow) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data: id, error } = await sb.rpc("clock_out", { _note: data.note ?? null });
    if (error) throw new Error(error.message);
    return { id };
  });

export const getMyTimesheets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp } = await supabaseAdmin.from("employees").select("id").eq("user_id", context.userId).maybeSingle();
    if (!emp) return { rows: [], entries: [] };
    const [{ data: rows }, { data: entries }] = await Promise.all([
      supabaseAdmin.from("timesheets").select("*").eq("employee_id", emp.id).order("week_start", { ascending: false }).limit(12),
      supabaseAdmin.from("time_entries").select("*").eq("employee_id", emp.id).order("clock_in", { ascending: false }).limit(50),
    ]);
    return { rows: rows ?? [], entries: entries ?? [] };
  });

export const submitTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ week_start: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp } = await supabaseAdmin.from("employees").select("id").eq("user_id", context.userId).maybeSingle();
    if (!emp) throw new Error("No employee record");
    await supabaseAdmin.rpc("compute_timesheet", { _employee_id: emp.id, _week_start: data.week_start });
    const { error } = await supabaseAdmin.from("timesheets")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), submitted_by: context.userId } as never)
      .eq("employee_id", emp.id).eq("week_start", data.week_start);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPendingTimesheets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const isHr = (roleRows ?? []).some((r) => r.role === "hr_admin");
    const { data: me } = await supabaseAdmin.from("employees").select("id").eq("user_id", context.userId).maybeSingle();
    let query = supabaseAdmin.from("timesheets")
      .select("*, employee:employees!inner(id, first_name, last_name, department, manager_id)")
      .eq("status", "submitted");
    if (!isHr && me) query = query.eq("employee.manager_id", me.id);
    const { data, error } = await query.order("week_start", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const decideTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    timesheet_id: z.string().uuid(),
    decision: z.enum(["approved", "denied"]),
    notes: z.string().max(1000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as { rpc: (n: string, a: AnyRow) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { error } = await sb.rpc("approve_timesheet", {
      _ts_id: data.timesheet_id, _decision: data.decision, _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setEmployeeSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    employee_id: z.string().uuid(),
    expected_weekly_hours: z.number().min(0).max(168),
    mon_start: z.string().nullable().optional(), mon_end: z.string().nullable().optional(),
    tue_start: z.string().nullable().optional(), tue_end: z.string().nullable().optional(),
    wed_start: z.string().nullable().optional(), wed_end: z.string().nullable().optional(),
    thu_start: z.string().nullable().optional(), thu_end: z.string().nullable().optional(),
    fri_start: z.string().nullable().optional(), fri_end: z.string().nullable().optional(),
    sat_start: z.string().nullable().optional(), sat_end: z.string().nullable().optional(),
    sun_start: z.string().nullable().optional(), sun_end: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roleRows ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR admin only");
    const { error } = await supabaseAdmin.from("employee_schedules").insert({
      ...data, effective_from: new Date().toISOString().slice(0, 10),
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTimeAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roleRows ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR admin only");
    const [{ data: policy }, { data: schedules }, { data: timesheets }, { data: ledger }] = await Promise.all([
      supabaseAdmin.from("time_policies").select("*").eq("is_active", true).limit(1).maybeSingle(),
      supabaseAdmin.from("employee_schedules").select("*, employee:employees(id, first_name, last_name, department)").order("created_at", { ascending: false }).limit(200),
      supabaseAdmin.from("timesheets").select("*, employee:employees(first_name, last_name, department)").order("week_start", { ascending: false }).limit(100),
      supabaseAdmin.from("comp_time_ledger").select("*, employee:employees(first_name, last_name)").order("created_at", { ascending: false }).limit(100),
    ]);
    return { policy, schedules: schedules ?? [], timesheets: timesheets ?? [], ledger: ledger ?? [] };
  });

export const updateTimePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    daily_ot_threshold: z.number().min(0).max(24),
    weekly_ot_threshold: z.number().min(0).max(168),
    ot_multiplier: z.number().min(1).max(3),
    comp_time_multiplier: z.number().min(1).max(3),
    exempt_comp_multiplier: z.number().min(0.1).max(3),
    rounding_minutes: z.number().int().min(0).max(15),
    allow_comp_in_lieu: z.boolean(),
    max_comp_bank_hours: z.number().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roleRows ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR admin only");
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin.from("time_policies").update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });