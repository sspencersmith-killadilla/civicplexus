import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHrAdmin } from "@/lib/role-check.server";

const providerEnum = z.enum(["chamilo", "moodle", "forma"]);
const authKindEnum = z.enum(["api_key", "oauth2", "basic"]);

function secretEnvName(id: string) {
  return `LMS_${id.replace(/-/g, "_").toUpperCase()}_TOKEN`;
}

export const listLmsConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conns } = await supabaseAdmin
      .from("lms_connections")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: runs } = await supabaseAdmin
      .from("lms_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);
    return { connections: conns ?? [], runs: runs ?? [] };
  });

export const upsertLmsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      provider: providerEnum,
      label: z.string().min(1).max(120),
      base_url: z.string().url().max(500),
      auth_kind: authKindEnum.default("api_key"),
      username: z.string().max(200).optional().nullable(),
      enabled: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      provider: data.provider,
      label: data.label,
      base_url: data.base_url,
      auth_kind: data.auth_kind,
      username: data.username ?? null,
      enabled: data.enabled,
      created_by: context.userId,
    };
    let id = data.id;
    if (id) {
      const { error } = await supabaseAdmin.from("lms_connections").update(row as never).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("lms_connections")
        .insert(row as never)
        .select("id")
        .single();
      if (error || !ins) throw new Error(error?.message ?? "Insert failed");
      id = (ins as { id: string }).id;
    }
    const envName = secretEnvName(id!);
    await supabaseAdmin.from("lms_connections").update({ secret_name: envName } as never).eq("id", id!);
    return { id, secret_env: envName };
  });

export const deleteLmsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lms_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function resolveSecret(secretEnv: string | null): Promise<string | null> {
  if (!secretEnv) return null;
  return process.env[secretEnv] ?? null;
}

export const testLmsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conn } = await supabaseAdmin.from("lms_connections").select("*").eq("id", data.id).maybeSingle();
    if (!conn) throw new Error("Connection not found");
    const c = conn as { provider: "chamilo"|"moodle"|"forma"; base_url: string; auth_kind: "api_key"|"oauth2"|"basic"; username: string | null; secret_name: string | null };
    const secret = await resolveSecret(c.secret_name);
    if (!secret) return { ok: false, message: `Missing secret env ${c.secret_name}. Save it in project secrets.` };
    const { getLmsProvider } = await import("@/lib/lms-providers.server");
    return getLmsProvider(c.provider).testConnection({
      provider: c.provider, base_url: c.base_url, auth_kind: c.auth_kind, username: c.username, secret,
    });
  });

export const runLmsSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    return await performSync(data.id, "manual");
  });

export async function performSync(connectionId: string, trigger: "manual" | "cron") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conn } = await supabaseAdmin.from("lms_connections").select("*").eq("id", connectionId).maybeSingle();
  if (!conn) throw new Error("Connection not found");
  const c = conn as {
    id: string; provider: "chamilo"|"moodle"|"forma"; base_url: string; auth_kind: "api_key"|"oauth2"|"basic";
    username: string | null; secret_name: string | null; sync_cursor: string | null; enabled: boolean;
  };
  if (!c.enabled) return { skipped: true };

  const { data: runIns } = await supabaseAdmin.from("lms_sync_runs").insert({
    connection_id: c.id, triggered_by: trigger, status: "running",
  } as never).select("id").single();
  const runId = (runIns as { id: string }).id;

  try {
    const secret = await resolveSecret(c.secret_name);
    if (!secret) throw new Error(`Missing secret env ${c.secret_name}`);
    const { getLmsProvider, matchAndApplyCompletions } = await import("@/lib/lms-providers.server");
    const provider = getLmsProvider(c.provider);
    const completions = await provider.fetchCompletions(
      { provider: c.provider, base_url: c.base_url, auth_kind: c.auth_kind, username: c.username, secret },
      c.sync_cursor,
    );
    const result = await matchAndApplyCompletions(supabaseAdmin as never, completions);

    // Record as an lms_credit_imports row for unified history
    await supabaseAdmin.from("lms_credit_imports").insert({
      provider: c.provider,
      filename: `auto-sync-${new Date().toISOString()}`,
      status: "committed",
      total_rows: result.fetched,
      matched_rows: result.matched,
      unmatched_rows: result.fetched - result.matched,
      applied_rows: result.applied,
      errors: result.errors.slice(0, 200) as never,
      connection_id: c.id,
      committed_at: new Date().toISOString(),
    } as never);

    await supabaseAdmin.from("lms_sync_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      rows_fetched: result.fetched,
      matched: result.matched,
      unmatched: result.fetched - result.matched,
      applied: result.applied,
      errors: result.errors.slice(0, 200) as never,
    } as never).eq("id", runId);

    await supabaseAdmin.from("lms_connections").update({
      sync_cursor: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_error: null,
    } as never).eq("id", c.id);

    return { runId, ...result };
  } catch (e) {
    const msg = (e as Error).message;
    await supabaseAdmin.from("lms_sync_runs").update({
      status: "error", finished_at: new Date().toISOString(), errors: [{ row: 0, error: msg }] as never,
    } as never).eq("id", runId);
    await supabaseAdmin.from("lms_connections").update({
      last_sync_at: new Date().toISOString(), last_sync_status: "error", last_error: msg,
    } as never).eq("id", c.id);
    throw e;
  }
}