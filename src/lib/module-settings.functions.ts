import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Toggle = { key: string; enabled: boolean };

export const updateModuleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { changes: Toggle[] }) => {
    if (!data || !Array.isArray(data.changes)) throw new Error("Invalid input");
    for (const c of data.changes) {
      if (typeof c.key !== "string" || typeof c.enabled !== "boolean") {
        throw new Error("Invalid change entry");
      }
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "hr_admin")
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!roleRow) throw new Error("Forbidden");

    for (const c of data.changes) {
      const { error } = await supabase
        .from("module_settings")
        .update({ enabled: c.enabled, updated_by: userId })
        .eq("key", c.key);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.changes.length };
  });