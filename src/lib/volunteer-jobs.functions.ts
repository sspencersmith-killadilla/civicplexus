import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertHr(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data || data.length === 0) throw new Error("HR admin only");
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/** Public — list open volunteer jobs with upcoming shifts. */
export const listPublicVolunteerJobs = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: jobs } = await supabaseAdmin
    .from("volunteer_jobs")
    .select("id, title, slug, description, location, skills_required, requires_background_check, requires_waiver, min_age")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const jobIds = (jobs ?? []).map((j) => j.id);
  if (!jobIds.length) return [];
  const { data: shifts } = await supabaseAdmin
    .from("volunteer_shifts")
    .select("id, job_id, starts_at, ends_at, location, capacity")
    .in("job_id", jobIds)
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  const { data: counts } = await supabaseAdmin
    .from("volunteer_shift_signups")
    .select("shift_id, status")
    .in("shift_id", (shifts ?? []).map((s) => s.id))
    .eq("status", "approved");
  const takenByShift: Record<string, number> = {};
  for (const c of counts ?? []) takenByShift[c.shift_id] = (takenByShift[c.shift_id] ?? 0) + 1;
  return (jobs ?? []).map((j) => ({
    ...j,
    shifts: (shifts ?? []).filter((s) => s.job_id === j.id).map((s) => ({ ...s, taken: takenByShift[s.id] ?? 0 })),
  }));
});

/** Staff — list all jobs with shift counts. */
export const listVolunteerJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("volunteer_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertVolunteerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid().nullable().optional(),
    title: z.string().min(1).max(200),
    description: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    skills_required: z.array(z.string()).default([]),
    min_age: z.number().int().nullable().optional(),
    requires_background_check: z.boolean().default(false),
    requires_waiver: z.boolean().default(true),
    status: z.enum(["open", "closed", "draft"]).default("open"),
    coordinator_email: z.string().email().nullable().optional().or(z.literal("")),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context.supabase, context.userId);
    const row = {
      title: data.title,
      slug: slugify(data.title) + "-" + Math.random().toString(36).slice(2, 6),
      description: data.description ?? null,
      location: data.location ?? null,
      skills_required: data.skills_required,
      min_age: data.min_age ?? null,
      requires_background_check: data.requires_background_check,
      requires_waiver: data.requires_waiver,
      status: data.status,
      coordinator_email: data.coordinator_email || null,
    };
    if (data.id) {
      const { slug: _slug, ...update } = row;
      const { error } = await context.supabase.from("volunteer_jobs").update(update).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("volunteer_jobs").insert({ ...row, created_by: context.userId }).select("id, slug").single();
    if (error) throw new Error(error.message);
    return ins as { id: string; slug: string };
  });

export const deleteVolunteerJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context.supabase, context.userId);
    const { error } = await context.supabase.from("volunteer_jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listShiftsForJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ job_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: shifts } = await context.supabase
      .from("volunteer_shifts").select("*").eq("job_id", data.job_id).order("starts_at");
    return shifts ?? [];
  });

export const upsertShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid().nullable().optional(),
    job_id: z.string().uuid(),
    starts_at: z.string(),
    ends_at: z.string(),
    location: z.string().nullable().optional(),
    capacity: z.number().int().min(1).default(1),
    notes: z.string().nullable().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context.supabase, context.userId);
    const row = {
      job_id: data.job_id,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      location: data.location ?? null,
      capacity: data.capacity,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("volunteer_shifts").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("volunteer_shifts").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return ins as { id: string };
  });

export const deleteShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context.supabase, context.userId);
    const { error } = await context.supabase.from("volunteer_shifts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAllSignups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("volunteer_shift_signups")
      .select("*, shift:volunteer_shifts(id, starts_at, ends_at, job_id, volunteer_jobs(title))")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const decideSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["approve", "reject"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context.supabase, context.userId);
    const pin = data.action === "approve" ? Math.floor(1000 + Math.random() * 9000).toString() : null;
    const { error } = await context.supabase.from("volunteer_shift_signups").update({
      status: data.action === "approve" ? "approved" : "rejected",
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
      pin_code: pin,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, pin };
  });

/** Staff — list active clock sessions and recent history. */
export const listClockEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("volunteer_clock_events")
      .select("*, signup:volunteer_shift_signups(applicant_first_name, applicant_last_name, shift_id, volunteer_shifts(starts_at, ends_at, volunteer_jobs(title)))")
      .order("clock_in", { ascending: false })
      .limit(200);
    return data ?? [];
  });

/** Kiosk — search approved signups by name for today's shifts. */
export const kioskSearchSignups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ q: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const today = new Date();
    const start = new Date(today); start.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setHours(23, 59, 59, 999);
    const { data: rows } = await context.supabase
      .from("volunteer_shift_signups")
      .select("id, applicant_first_name, applicant_last_name, pin_code, shift:volunteer_shifts!inner(id, starts_at, ends_at, volunteer_jobs(title))")
      .eq("status", "approved")
      .or(`applicant_first_name.ilike.%${data.q}%,applicant_last_name.ilike.%${data.q}%`)
      .gte("shift.starts_at", start.toISOString())
      .lte("shift.starts_at", end.toISOString())
      .limit(20);
    return rows ?? [];
  });

export const kioskClock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    signup_id: z.string().uuid(),
    action: z.enum(["in", "out"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: signup } = await context.supabase
      .from("volunteer_shift_signups").select("status").eq("id", data.signup_id).maybeSingle();
    if (!signup || (signup as { status: string }).status !== "approved") {
      throw new Error("Applicant is not approved for this shift yet");
    }
    if (data.action === "in") {
      const { error } = await context.supabase.from("volunteer_clock_events").insert({
        signup_id: data.signup_id, method: "kiosk", logged_by: context.userId,
      });
      if (error) throw new Error(error.message);
    } else {
      const { data: open } = await context.supabase
        .from("volunteer_clock_events").select("id").eq("signup_id", data.signup_id).is("clock_out", null).order("clock_in", { ascending: false }).limit(1).maybeSingle();
      if (!open) throw new Error("No open clock-in");
      const { error } = await context.supabase.from("volunteer_clock_events").update({ clock_out: new Date().toISOString() }).eq("id", (open as { id: string }).id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export type TimesheetEntry = {
  signup_id: string;
  volunteer_name: string;
  applicant_email: string | null;
  job_title: string;
  shift_starts_at: string | null;
  shift_ends_at: string | null;
  clock_in: string;
  clock_out: string | null;
  hours: number;
  method: string;
  notes: string | null;
};

/** Coordinator — generate a timesheet from clock events across a date range. */
export const generateVolunteerTimesheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    from: z.string(),
    to: z.string(),
    job_id: z.string().uuid().nullable().optional(),
    include_open: z.boolean().default(false),
  }).parse(i))
  .handler(async ({ data, context }): Promise<{ entries: TimesheetEntry[]; totals: { total_hours: number; total_sessions: number; unique_volunteers: number } }> => {
    let query = context.supabase
      .from("volunteer_clock_events")
      .select("id, clock_in, clock_out, method, notes, signup:volunteer_shift_signups(id, applicant_first_name, applicant_last_name, applicant_email, shift:volunteer_shifts(starts_at, ends_at, job_id, volunteer_jobs(title)))")
      .gte("clock_in", data.from)
      .lte("clock_in", data.to)
      .order("clock_in", { ascending: true });
    if (!data.include_open) query = query.not("clock_out", "is", null);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    type Row = {
      id: string; clock_in: string; clock_out: string | null; method: string; notes: string | null;
      signup: {
        id: string; applicant_first_name: string; applicant_last_name: string; applicant_email: string | null;
        shift: { starts_at: string | null; ends_at: string | null; job_id: string; volunteer_jobs: { title: string } | null } | null;
      } | null;
    };
    const filtered = ((rows ?? []) as unknown as Row[]).filter((r) => !data.job_id || r.signup?.shift?.job_id === data.job_id);

    const entries: TimesheetEntry[] = filtered.map((r) => {
      const start = new Date(r.clock_in).getTime();
      const end = r.clock_out ? new Date(r.clock_out).getTime() : Date.now();
      const hours = Math.max(0, Math.round(((end - start) / 3600000) * 100) / 100);
      return {
        signup_id: r.signup?.id ?? "",
        volunteer_name: r.signup ? `${r.signup.applicant_first_name} ${r.signup.applicant_last_name}` : "—",
        applicant_email: r.signup?.applicant_email ?? null,
        job_title: r.signup?.shift?.volunteer_jobs?.title ?? "—",
        shift_starts_at: r.signup?.shift?.starts_at ?? null,
        shift_ends_at: r.signup?.shift?.ends_at ?? null,
        clock_in: r.clock_in,
        clock_out: r.clock_out,
        hours,
        method: r.method,
        notes: r.notes,
      };
    });
    const total_hours = Math.round(entries.reduce((s, e) => s + e.hours, 0) * 100) / 100;
    const unique_volunteers = new Set(entries.map((e) => e.signup_id).filter(Boolean)).size;
    return { entries, totals: { total_hours, total_sessions: entries.length, unique_volunteers } };
  });