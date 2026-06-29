import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHrAdmin } from "@/lib/role-check.server";
import { z } from "zod";

export const APP_ROLES = [
  "hr_admin",
  "hiring_manager",
  "supervisor",
  "it_admin",
  "employee",
  "candidate",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** List every user with at least one role plus their profile, for the role manager. */
export const listRoleAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("user_id, role");
    if (error) throw error;
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    let profiles: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (ids.length) {
      const { data } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      profiles = (data ?? []) as typeof profiles;
    }
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const grouped = new Map<string, { user_id: string; full_name: string | null; email: string | null; roles: string[] }>();
    for (const r of roles ?? []) {
      const p = byId.get(r.user_id);
      const entry = grouped.get(r.user_id) ?? {
        user_id: r.user_id,
        full_name: p?.full_name ?? null,
        email: p?.email ?? null,
        roles: [],
      };
      entry.roles.push(r.role as string);
      grouped.set(r.user_id, entry);
    }
    return Array.from(grouped.values()).sort((a, b) =>
      (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""),
    );
  });

/** Search profiles by name/email so an admin can grant a role to anyone. */
export const searchProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ q: z.string().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const q = data.q.trim();
    const { data: rows, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(20);
    if (error) throw error;
    return (rows ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
  });

const RoleInput = z.object({
  user_id: z.string().uuid(),
  role: z.enum(APP_ROLES),
});

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RoleInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role })
      .select()
      .maybeSingle();
    if (error && !/duplicate key/i.test(error.message)) throw error;
    await context.supabase.from("audit_events").insert({
      actor_id: context.userId,
      action: "role_grant",
      entity: "user_role",
      entity_id: data.user_id,
      diff: { role: data.role },
    });
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RoleInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    // Block removing the last hr_admin to avoid lockout.
    if (data.role === "hr_admin") {
      const { count } = await context.supabase
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "hr_admin");
      if ((count ?? 0) <= 1) throw new Error("Cannot remove the last HR admin");
    }
    const { error } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw error;
    await context.supabase.from("audit_events").insert({
      actor_id: context.userId,
      action: "role_revoke",
      entity: "user_role",
      entity_id: data.user_id,
      diff: { role: data.role },
    });
    return { ok: true };
  });

/** Current AI provider status + org-level wizard state, for the settings panel. */
export const getOrgAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const provider = (process.env.AI_PROVIDER ?? "lovable").toLowerCase();
    const configured =
      provider === "none" ||
      (provider === "lovable" && !!process.env.LOVABLE_API_KEY) ||
      (provider === "openai" && !!process.env.OPENAI_API_KEY) ||
      (provider === "azure" && !!process.env.AZURE_OPENAI_API_KEY);
    const model =
      provider === "openai" ? process.env.OPENAI_MODEL ?? "gpt-4o-mini" :
      provider === "azure" ? process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini" :
      provider === "none" ? "disabled" :
      "google/gemini-3-flash-preview";
    const { data: org } = await context.supabase
      .from("org_settings")
      .select("org_name, first_run_complete, first_run_completed_at, fallback_admin_user_id")
      .maybeSingle();
    let fallbackAdmin: { id: string; full_name: string | null; email: string | null } | null = null;
    if (org?.fallback_admin_user_id) {
      const { data: p } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", org.fallback_admin_user_id)
        .maybeSingle();
      fallbackAdmin = (p as typeof fallbackAdmin) ?? null;
    }
    return {
      provider,
      configured,
      model,
      org_name: org?.org_name ?? "",
      first_run_complete: !!org?.first_run_complete,
      first_run_completed_at: org?.first_run_completed_at ?? null,
      fallback_admin: fallbackAdmin,
    };
  });