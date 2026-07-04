import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type VolunteerRow = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  skills: string[];
  notes: string | null;
};

/** Return current user's volunteer profile, if any. */
export const getMyVolunteerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("volunteers")
      .select("id, user_id, first_name, last_name, email, phone, status, skills, notes")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as VolunteerRow | null;
  });

/** Create or update the current user's volunteer profile. */
export const upsertMyVolunteerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      first_name: z.string().trim().min(1).max(80),
      last_name: z.string().trim().min(1).max(80),
      email: z.string().trim().email().max(200).nullable().optional(),
      phone: z.string().trim().max(40).nullable().optional(),
      skills: z.array(z.string().trim().max(60)).max(30).default([]),
      notes: z.string().trim().max(2000).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Try find existing row
    const { data: existing } = await context.supabase
      .from("volunteers")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("volunteers")
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email ?? null,
          phone: data.phone ?? null,
          skills: data.skills,
          notes: data.notes ?? null,
        })
        .eq("id", (existing as { id: string }).id);
      if (error) throw new Error(error.message);
      return { id: (existing as { id: string }).id };
    }
    const { data: ins, error } = await context.supabase
      .from("volunteers")
      .insert({
        user_id: context.userId,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        skills: data.skills,
        notes: data.notes ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

/** Register current user for a shift; goes to pending for coordinator approval. */
export const registerForShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      shift_id: z.string().uuid(),
      message: z.string().trim().max(2000).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Load volunteer profile
    const { data: v } = await context.supabase
      .from("volunteers")
      .select("id, first_name, last_name, email, phone")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!v) throw new Error("Complete your volunteer profile first.");
    const vol = v as { id: string; first_name: string; last_name: string; email: string | null; phone: string | null };

    // Prevent duplicate signup for the same shift
    const { data: dup } = await context.supabase
      .from("volunteer_shift_signups")
      .select("id, status")
      .eq("shift_id", data.shift_id)
      .eq("volunteer_id", vol.id)
      .maybeSingle();
    if (dup) throw new Error("You're already signed up for this shift.");

    const { error } = await context.supabase.from("volunteer_shift_signups").insert({
      shift_id: data.shift_id,
      volunteer_id: vol.id,
      applicant_first_name: vol.first_name,
      applicant_last_name: vol.last_name,
      applicant_email: vol.email,
      applicant_phone: vol.phone,
      message: data.message ?? null,
      status: "pending",
    });
    if (error) throw new Error(error.message);

    // Notify HR / hiring managers
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: coords } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["hr_admin", "hiring_manager"]);
    for (const row of (coords ?? []) as Array<{ user_id: string }>) {
      await supabaseAdmin.from("notifications").insert({
        user_id: row.user_id,
        type: "volunteer_signup",
        title: "New volunteer sign-up",
        body: `${vol.first_name} ${vol.last_name} requested a shift`,
        link: "/volunteer-admin",
      });
    }
    return { ok: true };
  });

/** List current user's signups with shift + job + open clock event. */
export const listMySignups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: v } = await context.supabase
      .from("volunteers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!v) return [];
    const vid = (v as { id: string }).id;
    const { data, error } = await context.supabase
      .from("volunteer_shift_signups")
      .select("id, status, message, created_at, shift:shift_id(id, starts_at, ends_at, location, volunteer_jobs:job_id(id, title, slug, location))")
      .eq("volunteer_id", vid)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const list = (data ?? []) as unknown as Array<{
      id: string; status: string; message: string | null; created_at: string;
      shift: { id: string; starts_at: string; ends_at: string; location: string | null; volunteer_jobs: { id: string; title: string; slug: string; location: string | null } | null } | null;
    }>;
    // Attach latest open clock event per signup
    const ids = list.map((s) => s.id);
    let openBySignup: Record<string, { id: string; clock_in: string } | undefined> = {};
    if (ids.length) {
      const { data: opens } = await context.supabase
        .from("volunteer_clock_events")
        .select("id, signup_id, clock_in, clock_out")
        .in("signup_id", ids)
        .is("clock_out", null);
      openBySignup = Object.fromEntries(
        ((opens ?? []) as Array<{ id: string; signup_id: string; clock_in: string }>).map((e) => [e.signup_id, { id: e.id, clock_in: e.clock_in }]),
      );
    }
    return list.map((s) => ({ ...s, open_event: openBySignup[s.id] ?? null }));
  });

/** Clock in / out for one of the user's approved signups. */
export const volunteerClock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      signup_id: z.string().uuid(),
      action: z.enum(["in", "out"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Confirm ownership + approved status
    const { data: s } = await context.supabase
      .from("volunteer_shift_signups")
      .select("id, status, volunteer_id, volunteers:volunteer_id(user_id)")
      .eq("id", data.signup_id)
      .maybeSingle();
    const row = s as { id: string; status: string; volunteers: { user_id: string | null } | null } | null;
    if (!row || row.volunteers?.user_id !== context.userId) throw new Error("Not found.");
    if (row.status !== "approved") throw new Error("Coordinator has not approved this shift yet.");

    if (data.action === "in") {
      const { data: open } = await context.supabase
        .from("volunteer_clock_events")
        .select("id")
        .eq("signup_id", data.signup_id)
        .is("clock_out", null)
        .maybeSingle();
      if (open) throw new Error("Already clocked in.");
      const { error } = await context.supabase.from("volunteer_clock_events").insert({
        signup_id: data.signup_id,
        method: "self",
        logged_by: context.userId,
      });
      if (error) throw new Error(error.message);
      return { ok: true, message: "Clocked in." };
    }
    const { data: open } = await context.supabase
      .from("volunteer_clock_events")
      .select("id")
      .eq("signup_id", data.signup_id)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!open) throw new Error("No active clock-in.");
    const { error } = await context.supabase
      .from("volunteer_clock_events")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", (open as { id: string }).id);
    if (error) throw new Error(error.message);
    return { ok: true, message: "Clocked out." };
  });

/** Cancel a pending signup. */
export const cancelSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ signup_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("volunteer_shift_signups")
      .select("id, status, volunteers:volunteer_id(user_id)")
      .eq("id", data.signup_id)
      .maybeSingle();
    const row = s as { id: string; status: string; volunteers: { user_id: string | null } | null } | null;
    if (!row || row.volunteers?.user_id !== context.userId) throw new Error("Not found.");
    if (row.status !== "pending") throw new Error("Only pending sign-ups can be cancelled.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("volunteer_shift_signups").delete().eq("id", data.signup_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });