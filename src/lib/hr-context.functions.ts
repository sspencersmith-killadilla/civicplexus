import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export const getCurrentUserContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profile }, { data: roleRows }, { data: employee }, { data: perms }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
      supabaseAdmin.from("employees").select("id").eq("user_id", context.userId).maybeSingle(),
      supabaseAdmin.rpc("get_effective_permissions", { _uid: context.userId }),
    ]);

    const roles = ((roleRows ?? []) as Array<{ role: AppRole }>).map((r) => r.role);

    return {
      profile,
      roles,
      permissions: ((perms ?? []) as Array<{ permission_key: string }>).map((p) => p.permission_key),
      employee_id: (employee as { id?: string } | null)?.id ?? null,
      is_hr_admin: roles.includes("hr_admin"),
    };
  });