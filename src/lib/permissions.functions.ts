import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: never; userId: string };

async function assertHr(ctx: { supabase: unknown; userId: string }) {
  const supa = ctx.supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => { eq: (k: string, v: string) => Promise<{ data: unknown[] | null }> };
      };
    };
  };
  const { data } = await supa.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "hr_admin");
  if (!data || (data as unknown[]).length === 0) throw new Error("HR admin only");
}

export const listPermissionKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("permission_keys")
      .select("key,label,category,description")
      .order("category")
      .order("key");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPermissionGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("permission_groups")
      .select("id,name,description,is_system,created_at")
      .order("name");
    if (error) throw new Error(error.message);
    const { data: keys } = await context.supabase
      .from("permission_group_keys")
      .select("group_id,permission_key");
    const byGroup: Record<string, string[]> = {};
    for (const r of (keys ?? []) as Array<{ group_id: string; permission_key: string }>) {
      (byGroup[r.group_id] ||= []).push(r.permission_key);
    }
    return (data ?? []).map((g: { id: string }) => ({ ...g, keys: byGroup[g.id] ?? [] }));
  });

export const upsertPermissionGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(120),
      description: z.string().max(500).optional().or(z.literal("")),
      keys: z.array(z.string()).default([]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context as unknown as Ctx);
    let id = data.id;
    if (id) {
      const { error } = await context.supabase
        .from("permission_groups")
        .update({ name: data.name, description: data.description || null })
        .eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await context.supabase
        .from("permission_groups")
        .insert({ name: data.name, description: data.description || null, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = (ins as { id: string }).id;
    }
    // Replace keys.
    await context.supabase.from("permission_group_keys").delete().eq("group_id", id);
    if (data.keys.length) {
      const rows = data.keys.map((k) => ({ group_id: id!, permission_key: k }));
      const { error } = await context.supabase.from("permission_group_keys").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { id };
  });

export const deletePermissionGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context as unknown as Ctx);
    const { data: row } = await context.supabase
      .from("permission_groups").select("is_system").eq("id", data.id).maybeSingle();
    if ((row as { is_system?: boolean } | null)?.is_system) throw new Error("System groups cannot be deleted");
    const { error } = await context.supabase.from("permission_groups").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listUserPermissionAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context as unknown as Ctx);
    const [{ data: groups }, { data: overrides }, { data: effective }] = await Promise.all([
      context.supabase.from("user_permission_groups").select("group_id,granted_at").eq("user_id", data.user_id),
      context.supabase.from("user_permission_grants").select("permission_key,mode,granted_at").eq("user_id", data.user_id),
      context.supabase.rpc("get_effective_permissions", { _uid: data.user_id }),
    ]);
    return {
      groups: (groups ?? []) as Array<{ group_id: string; granted_at: string }>,
      overrides: (overrides ?? []) as Array<{ permission_key: string; mode: "grant" | "deny"; granted_at: string }>,
      effective: (effective ?? []) as Array<{ permission_key: string; source: string }>,
    };
  });

export const assignUserToGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid(), group_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context as unknown as Ctx);
    const { error } = await context.supabase
      .from("user_permission_groups")
      .upsert({ user_id: data.user_id, group_id: data.group_id, granted_by: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeUserFromGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ user_id: z.string().uuid(), group_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context as unknown as Ctx);
    const { error } = await context.supabase
      .from("user_permission_groups").delete()
      .eq("user_id", data.user_id).eq("group_id", data.group_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserPermissionOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      permission_key: z.string().min(1),
      mode: z.enum(["grant", "deny", "clear"]),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context as unknown as Ctx);
    if (data.mode === "clear") {
      const { error } = await context.supabase
        .from("user_permission_grants").delete()
        .eq("user_id", data.user_id).eq("permission_key", data.permission_key);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("user_permission_grants")
        .upsert({
          user_id: data.user_id,
          permission_key: data.permission_key,
          mode: data.mode,
          granted_by: context.userId,
        });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_effective_permissions", { _uid: context.userId });
    if (error) return [] as string[];
    return ((data ?? []) as Array<{ permission_key: string }>).map((r) => r.permission_key);
  });