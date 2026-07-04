import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "team";
}

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    name: z.string().min(2).max(120),
    purpose: z.string().max(500).optional(),
    sponsor_employee_id: z.string().uuid().optional().nullable(),
    target_end_date: z.string().optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // unique slug
    const base = slugify(data.name);
    let slug = base;
    for (let n = 2; n < 50; n++) {
      const { data: hit } = await supabaseAdmin.from("teams").select("id").eq("slug", slug).maybeSingle();
      if (!hit) break;
      slug = `${base}-${n}`;
    }
    const { data: row, error } = await supabaseAdmin.from("teams").insert({
      name: data.name,
      slug,
      purpose: data.purpose ?? null,
      sponsor_employee_id: data.sponsor_employee_id ?? null,
      target_end_date: data.target_end_date ?? null,
      created_by: context.userId,
      start_date: new Date().toISOString().slice(0, 10),
      status: "forming",
    } as never).select("id, slug").single();
    if (error) throw new Error(error.message);
    return row as { id: string; slug: string };
  });

export const addTeamMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    team_id: z.string().uuid(),
    members: z.array(z.object({
      employee_id: z.string().uuid(),
      role: z.enum(["sponsor", "lead", "member"]).default("member"),
      allocation_pct: z.number().int().min(0).max(100).optional().nullable(),
    })).min(1).max(50),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const rows = data.members.map((m) => ({
      team_id: data.team_id,
      employee_id: m.employee_id,
      role: m.role,
      allocation_pct: m.allocation_pct ?? null,
    }));
    // Use user-scoped supabase to enforce the "lead only" RLS check
    const { error } = await context.supabase.from("team_members").insert(rows as never);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const leaveTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ team_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: emp } = await supabaseAdmin.from("employees").select("id").eq("user_id", context.userId).maybeSingle();
    if (!emp) throw new Error("No employee record");
    const { error } = await context.supabase
      .from("team_members")
      .update({ left_at: new Date().toISOString() } as never)
      .eq("team_id", data.team_id)
      .eq("employee_id", (emp as { id: string }).id)
      .is("left_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cascadeTeamGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    parent_goal_id: z.string().uuid(),
    children: z.array(z.object({
      owner_member_id: z.string().uuid().optional().nullable(),
      title: z.string().min(2).max(300),
      description: z.string().max(4000).optional(),
      target_date: z.string().optional().nullable(),
      weight: z.number().min(0.1).max(10).default(1),
    })).min(1).max(50),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: parent, error: pErr } = await context.supabase
      .from("team_goals").select("team_id").eq("id", data.parent_goal_id).single();
    if (pErr) throw new Error(pErr.message);
    const rows = data.children.map((c) => ({
      team_id: (parent as { team_id: string }).team_id,
      parent_goal_id: data.parent_goal_id,
      owner_member_id: c.owner_member_id ?? null,
      title: c.title,
      description: c.description ?? null,
      target_date: c.target_date ?? null,
      weight: c.weight,
      created_by: context.userId,
      status: "active" as const,
    }));
    const { error } = await context.supabase.from("team_goals").insert(rows as never);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

export const updateTeamGoalProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    goal_id: z.string().uuid(),
    progress: z.number().int().min(0).max(100),
    status: z.enum(["draft", "active", "at_risk", "completed", "cancelled"]).optional(),
    note: z.string().max(2000).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const upd: Record<string, unknown> = { progress: data.progress };
    if (data.status) upd.status = data.status;
    const { error: uErr } = await context.supabase.from("team_goals").update(upd as never).eq("id", data.goal_id);
    if (uErr) throw new Error(uErr.message);
    const { error: iErr } = await context.supabase.from("team_goal_updates").insert({
      goal_id: data.goal_id,
      author_id: context.userId,
      progress: data.progress,
      status: data.status ?? null,
      note: data.note ?? null,
    } as never);
    if (iErr) throw new Error(iErr.message);
    return { ok: true };
  });