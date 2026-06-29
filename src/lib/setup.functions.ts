import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHrAdmin } from "@/lib/role-check.server";
import { z } from "zod";

/** Public read: whether the first-run wizard has been completed. */
export const getSetupStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await sb.rpc("first_run_status");
    const row = (data as Array<{ complete: boolean; org_name: string }> | null)?.[0];
    const provider = (process.env.AI_PROVIDER ?? "lovable").toLowerCase();
    const aiConfigured =
      provider === "none" ||
      (provider === "lovable" && !!process.env.LOVABLE_API_KEY) ||
      (provider === "openai" && !!process.env.OPENAI_API_KEY) ||
      (provider === "azure" && !!process.env.AZURE_OPENAI_API_KEY);
    return {
      complete: !!row?.complete,
      org_name: row?.org_name ?? "",
      ai_provider: provider,
      ai_configured: aiConfigured,
    };
  });

const OrgInput = z.object({
  org_name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  primary_color: z.string().max(20).optional(),
  accent_color: z.string().max(20).optional(),
});

/** Save organization profile (step 1). */
export const saveSetupOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("org_settings")
      .update({
        org_name: data.org_name,
        address: data.address ?? null,
        phone: data.phone ?? null,
        primary_color: data.primary_color ?? null,
        accent_color: data.accent_color ?? null,
      })
      .eq("singleton", true);
    if (error) throw error;
    return { ok: true };
  });

/** Set the fallback admin (step 2) — used by PAF when no supervisor exists. */
export const saveSetupFallbackAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ user_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("org_settings")
      .update({ fallback_admin_user_id: data.user_id })
      .eq("singleton", true);
    if (error) throw error;
    return { ok: true };
  });

/** List candidate users (for the fallback admin picker). */
export const listSetupAdminCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["hr_admin", "super_admin"]);
    const ids = Array.from(new Set((data ?? []).map((r) => r.user_id)));
    if (!ids.length) return [];
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    return (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
  });

/**
 * Seed the baseline onboarding templates (step 3). Idempotent: only inserts a
 * template for a worker type if one does not already exist.
 */
export const seedSetupTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { data: workerTypes, error: wtErr } = await context.supabase
      .from("worker_types")
      .select("id, name");
    if (wtErr) throw wtErr;

    const { data: existing } = await context.supabase
      .from("onboarding_templates")
      .select("worker_type_id");
    const have = new Set((existing ?? []).map((t) => t.worker_type_id));

    const toInsert = (workerTypes ?? [])
      .filter((w) => !have.has(w.id))
      .map((w) => ({
        name: `${w.name} onboarding`,
        description: `Default onboarding playbook for ${w.name} hires.`,
        worker_type_id: w.id,
        is_default: true,
        is_active: true,
      }));

    let created = 0;
    if (toInsert.length) {
      const { error } = await context.supabase.from("onboarding_templates").insert(toInsert);
      if (error) throw error;
      created = toInsert.length;
    }
    return { created, skipped: (workerTypes?.length ?? 0) - created };
  });

/** Finalize the wizard (step 4). */
export const completeSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("org_settings")
      .update({
        first_run_complete: true,
        first_run_completed_at: new Date().toISOString(),
      })
      .eq("singleton", true);
    if (error) throw error;
    return { ok: true };
  });

/** Allow re-running the wizard later (HR admin only). */
export const reopenSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("org_settings")
      .update({ first_run_complete: false })
      .eq("singleton", true);
    if (error) throw error;
    return { ok: true };
  });