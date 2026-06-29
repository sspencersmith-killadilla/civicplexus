import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHrAdmin } from "@/lib/role-check.server";
import { z } from "zod";

const APP_ROLES = ["hr_admin", "hiring_manager", "supervisor", "it_admin", "employee", "candidate"] as const;

/** HR admin: look up an auth user by email, link to an employee record, optionally grant a role. */
export const linkUserToEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      employee_id: z.string().uuid(),
      email: z.string().email(),
      role: z.enum(APP_ROLES).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find the auth user by email (paginate up to 1000)
    const email = data.email.toLowerCase().trim();
    let foundId: string | null = null;
    for (let page = 1; page <= 10 && !foundId; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const match = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (match) foundId = match.id;
      if (list.users.length < 200) break;
    }
    if (!foundId) throw new Error(`No auth user found for ${data.email}. Ask them to sign up first.`);

    // Ensure not already linked to a different employee
    const { data: existing } = await supabaseAdmin
      .from("employees")
      .select("id, first_name, last_name")
      .eq("user_id", foundId)
      .neq("id", data.employee_id)
      .maybeSingle();
    if (existing) {
      throw new Error(`That account is already linked to ${existing.first_name} ${existing.last_name}.`);
    }

    const { error: upErr } = await supabaseAdmin
      .from("employees")
      .update({ user_id: foundId })
      .eq("id", data.employee_id);
    if (upErr) throw upErr;

    if (data.role) {
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: foundId, role: data.role });
      if (rErr && !/duplicate key/i.test(rErr.message)) throw rErr;
    }

    await supabaseAdmin.from("audit_events").insert({
      actor_id: context.userId,
      action: "employee_user_link",
      entity: "employee",
      entity_id: data.employee_id,
      diff: { user_id: foundId, email, role: data.role ?? null },
    });

    return { user_id: foundId };
  });

export const unlinkEmployeeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ employee_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("employees").update({ user_id: null }).eq("id", data.employee_id);
    if (error) throw error;
    await supabaseAdmin.from("audit_events").insert({
      actor_id: context.userId,
      action: "employee_user_unlink",
      entity: "employee",
      entity_id: data.employee_id,
      diff: {},
    });
    return { ok: true };
  });