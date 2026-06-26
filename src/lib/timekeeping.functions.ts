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
    return { id: String(id ?? "") };
  });

export const clockOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ note: z.string().max(500).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as { rpc: (n: string, a: AnyRow) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data: id, error } = await sb.rpc("clock_out", { _note: data.note ?? null });
    if (error) throw new Error(error.message);
    return { id: String(id ?? "") };
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

const ScheduleDays = z.object({
  expected_weekly_hours: z.number().min(0).max(168),
  mon_start: z.string().nullable().optional(), mon_end: z.string().nullable().optional(),
  tue_start: z.string().nullable().optional(), tue_end: z.string().nullable().optional(),
  wed_start: z.string().nullable().optional(), wed_end: z.string().nullable().optional(),
  thu_start: z.string().nullable().optional(), thu_end: z.string().nullable().optional(),
  fri_start: z.string().nullable().optional(), fri_end: z.string().nullable().optional(),
  sat_start: z.string().nullable().optional(), sat_end: z.string().nullable().optional(),
  sun_start: z.string().nullable().optional(), sun_end: z.string().nullable().optional(),
});

export const setMyExemptSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScheduleDays.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp } = await supabaseAdmin
      .from("employees").select("id, worker_type_id").eq("user_id", context.userId).maybeSingle();
    if (!emp) throw new Error("No employee record");
    const { data: wt } = await supabaseAdmin
      .from("worker_types").select("flsa_class").eq("id", emp.worker_type_id ?? "").maybeSingle();
    if (wt?.flsa_class !== "exempt") throw new Error("Only exempt employees can edit their own schedule");
    const today = new Date().toISOString().slice(0, 10);
    // Close out any open schedule so the new one becomes effective today.
    await supabaseAdmin.from("employee_schedules")
      .update({ effective_to: today } as never)
      .eq("employee_id", emp.id).is("effective_to", null);
    const { error } = await supabaseAdmin.from("employee_schedules").insert({
      employee_id: emp.id, effective_from: today, ...data,
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

// ---------- Shift catalog & rotating patterns ----------

async function requireHrAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR admin only");
}

export const listShiftCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: shifts }, { data: segs }, { data: patterns }, { data: days }] = await Promise.all([
      supabaseAdmin.from("shift_types").select("*").eq("is_active", true).order("name"),
      supabaseAdmin.from("shift_segments").select("*").order("segment_order"),
      supabaseAdmin.from("schedule_patterns").select("*").eq("is_active", true).order("name"),
      supabaseAdmin.from("pattern_days").select("*").order("day_index"),
    ]);
    return { shifts: shifts ?? [], segments: segs ?? [], patterns: patterns ?? [], days: days ?? [] };
  });

const SegmentInput = z.object({
  start_time: z.string(),
  end_time: z.string(),
  crosses_midnight: z.boolean().default(false),
  paid: z.boolean().default(true),
  unpaid_meal_min: z.number().int().min(0).max(240).default(0),
});

export const upsertShiftType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    code: z.string().optional().nullable(),
    color: z.string().default("#3b82f6"),
    description: z.string().optional().nullable(),
    is_off: z.boolean().default(false),
    total_paid_hours: z.number().min(0).max(168).default(0),
    segments: z.array(SegmentInput).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { segments, id, ...row } = data;
    let stId = id;
    if (stId) {
      const { error } = await supabaseAdmin.from("shift_types").update(row as never).eq("id", stId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("shift_segments").delete().eq("shift_type_id", stId);
    } else {
      const { data: ins, error } = await supabaseAdmin.from("shift_types").insert({ ...row, created_by: context.userId } as never).select("id").single();
      if (error) throw new Error(error.message);
      stId = (ins as { id: string }).id;
    }
    if (segments.length) {
      const rows = segments.map((s, i) => ({ ...s, shift_type_id: stId, segment_order: i + 1 }));
      const { error } = await supabaseAdmin.from("shift_segments").insert(rows as never);
      if (error) throw new Error(error.message);
    }
    return { id: stId };
  });

export const deleteShiftType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("shift_types").update({ is_active: false } as never).eq("id", data.id);
    return { ok: true };
  });

const PatternDayInput = z.object({
  day_index: z.number().int().min(1).max(56),
  shift_type_id: z.string().uuid().nullable(),
  is_off: z.boolean(),
});

export const upsertSchedulePattern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    cycle_length_days: z.number().int().min(1).max(56),
    category: z.string().optional().nullable(),
    days: z.array(PatternDayInput),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, days, ...row } = data;
    let pId = id;
    if (pId) {
      const { error } = await supabaseAdmin.from("schedule_patterns").update(row as never).eq("id", pId);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("pattern_days").delete().eq("pattern_id", pId);
    } else {
      const { data: ins, error } = await supabaseAdmin.from("schedule_patterns")
        .insert({ ...row, created_by: context.userId } as never).select("id").single();
      if (error) throw new Error(error.message);
      pId = (ins as { id: string }).id;
    }
    const rows = days.map((d) => ({ ...d, pattern_id: pId }));
    if (rows.length) {
      const { error } = await supabaseAdmin.from("pattern_days").insert(rows as never);
      if (error) throw new Error(error.message);
    }
    return { id: pId };
  });

export const assignEmployeePattern = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    employee_id: z.string().uuid(),
    pattern_id: z.string().uuid(),
    anchor_date: z.string(),
    effective_from: z.string().optional(),
    notes: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    await supabaseAdmin.from("employee_pattern_assignments")
      .update({ effective_to: today } as never)
      .eq("employee_id", data.employee_id).is("effective_to", null);
    const { error } = await supabaseAdmin.from("employee_pattern_assignments").insert({
      ...data, effective_from: data.effective_from ?? today, created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setEmployeeWorkPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    employee_id: z.string().uuid(),
    kind: z.enum(["standard_40", "207k_fire", "207k_law", "custom"]),
    period_days: z.number().int().min(1).max(28),
    period_anchor_date: z.string(),
    ot_threshold_hours: z.number().min(0).max(400),
    notes: z.string().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    await supabaseAdmin.from("employee_work_periods")
      .update({ effective_to: today } as never)
      .eq("employee_id", data.employee_id).is("effective_to", null);
    const { error } = await supabaseAdmin.from("employee_work_periods").insert({
      ...data, effective_from: today, created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getEmployeeShiftContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp } = await supabaseAdmin.from("employees").select("id").eq("user_id", context.userId).maybeSingle();
    if (!emp) return { assignment: null, pattern: null, days: [], shifts: [], segments: [], work_period: null };
    const { data: assignment } = await supabaseAdmin.from("employee_pattern_assignments")
      .select("*").eq("employee_id", emp.id).is("effective_to", null)
      .order("effective_from", { ascending: false }).limit(1).maybeSingle();
    const { data: work_period } = await supabaseAdmin.from("employee_work_periods")
      .select("*").eq("employee_id", emp.id).is("effective_to", null)
      .order("effective_from", { ascending: false }).limit(1).maybeSingle();
    let pattern = null, days: unknown[] = [], shifts: unknown[] = [], segments: unknown[] = [];
    if (assignment) {
      const [{ data: p }, { data: d }] = await Promise.all([
        supabaseAdmin.from("schedule_patterns").select("*").eq("id", assignment.pattern_id).maybeSingle(),
        supabaseAdmin.from("pattern_days").select("*").eq("pattern_id", assignment.pattern_id).order("day_index"),
      ]);
      pattern = p;
      days = d ?? [];
      const shiftIds = Array.from(new Set((d ?? []).map((r) => r.shift_type_id).filter(Boolean)));
      if (shiftIds.length) {
        const [{ data: s }, { data: seg }] = await Promise.all([
          supabaseAdmin.from("shift_types").select("*").in("id", shiftIds),
          supabaseAdmin.from("shift_segments").select("*").in("shift_type_id", shiftIds).order("segment_order"),
        ]);
        shifts = s ?? []; segments = seg ?? [];
      }
    }
    return { assignment, pattern, days, shifts, segments, work_period };
  });