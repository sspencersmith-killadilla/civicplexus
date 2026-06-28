import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const reassignOneOnOneManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { session_id: string; new_manager_user_id: string; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { requireHrAdmin } = await import("@/lib/role-check.server");
    await requireHrAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: e1 } = await supabaseAdmin
      .from("one_on_ones")
      .select("id, manager_user_id, employee_id")
      .eq("id", data.session_id)
      .maybeSingle();
    if (e1 || !existing) throw new Error("Session not found");

    const { error: e2 } = await supabaseAdmin
      .from("one_on_ones")
      .update({ manager_user_id: data.new_manager_user_id, updated_at: new Date().toISOString() })
      .eq("id", data.session_id);
    if (e2) throw new Error(e2.message);

    await supabaseAdmin.from("audit_events").insert({
      actor_id: context.userId,
      action: "one_on_one_manager_override",
      entity: "one_on_one",
      entity_id: data.session_id,
      diff: {
        employee_id: existing.employee_id,
        from_manager_user_id: existing.manager_user_id,
        to_manager_user_id: data.new_manager_user_id,
        reason: data.reason ?? "manual_override",
      },
    });

    return { ok: true };
  });

export const listManagerCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireHrAdmin } = await import("@/lib/role-check.server");
    await requireHrAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("employees")
      .select("id, first_name, last_name, department, job_title, user_id")
      .not("user_id", "is", null)
      .order("last_name");
    if (error) throw new Error(error.message);
    return (data ?? []).filter((e) => e.user_id);
  });