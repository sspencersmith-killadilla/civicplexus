import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEMO_EMAIL = "demo.purpose@testingaccount.test";
const DEMO_PASSWORD = "Demo, 1234";

async function assertHrAdmin(supabase: { from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> } } } } }, userId: string) {
  const { data, error } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: HR admin only");
}

export const provisionDemoAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHrAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find or create the auth user
    let userId: string | null = null;
    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) throw new Error(list.error.message);
    const existing = list.data.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
    if (existing) {
      userId = existing.id;
      const upd = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Demo Purpose" },
      });
      if (upd.error) throw new Error(upd.error.message);
    } else {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Demo Purpose" },
      });
      if (created.error) throw new Error(created.error.message);
      userId = created.data.user!.id;
    }

    // Profile
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: DEMO_EMAIL,
      full_name: "Demo Purpose",
    });

    // HR admin role
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role: "hr_admin" },
      { onConflict: "user_id,role" },
    );
    // Remove default candidate role if present
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "candidate");

    // Employee record
    const { data: emp } = await supabaseAdmin
      .from("employees").select("id").eq("user_id", userId).maybeSingle();
    if (!emp) {
      await supabaseAdmin.from("employees").insert({
        user_id: userId,
        first_name: "Demo",
        last_name: "Purpose",
        personal_email: DEMO_EMAIL,
        work_email: DEMO_EMAIL,
        job_title: "Demo HR Administrator",
        department: "Human Resources",
        start_date: new Date().toISOString().slice(0, 10),
        status: "active",
      });
    } else {
      await supabaseAdmin.from("employees").update({
        first_name: "Demo",
        last_name: "Purpose",
        status: "active",
      }).eq("id", emp.id);
    }

    // Register as the demo user (audit triggers key off this)
    await supabaseAdmin.from("demo_config").update({
      demo_user_id: userId,
      updated_at: new Date().toISOString(),
    }).eq("id", true);

    return { ok: true, email: DEMO_EMAIL, userId };
  });

export const resetDemoAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHrAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin.from("demo_config").select("demo_user_id").eq("id", true).maybeSingle();
    if (!cfg?.demo_user_id) throw new Error("Demo account not provisioned yet");
    const { data, error } = await supabaseAdmin.rpc("restore_demo_changes");
    if (error) throw new Error(error.message);
    await supabaseAdmin.auth.admin.updateUserById(cfg.demo_user_id, { password: DEMO_PASSWORD });
    return { ok: true, result: data };
  });

export const getDemoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHrAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin
      .from("demo_config").select("demo_user_id,last_reset_at,updated_at").eq("id", true).maybeSingle();
    const { count } = await supabaseAdmin
      .from("demo_audit_log").select("*", { count: "exact", head: true }).in("op", ["INSERT","UPDATE","DELETE"]);
    return {
      email: DEMO_EMAIL,
      provisioned: !!cfg?.demo_user_id,
      lastResetAt: cfg?.last_reset_at ?? null,
      pendingChanges: count ?? 0,
    };
  });