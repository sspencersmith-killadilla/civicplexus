import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Settings = {
  interview_retention_days: number;
  interview_recording_archive_enabled: boolean;
  interview_recording_archive_bucket: string | null;
  interview_recording_archive_prefix: string | null;
};

const SettingsInput = z.object({
  interview_retention_days: z.number().int().min(7).max(3650),
  interview_recording_archive_enabled: z.boolean(),
  interview_recording_archive_bucket: z.string().trim().max(255).nullable(),
  interview_recording_archive_prefix: z.string().trim().max(255).nullable(),
  note: z.string().trim().max(500).optional(),
});

async function assertHr(ctx: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> }; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "hr_admin" });
  if (!data) throw new Error("HR admin only");
}

export const getInterviewRetentionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHr(context);
    const { data, error } = await context.supabase
      .from("org_settings")
      .select("id, interview_retention_days, interview_recording_archive_enabled, interview_recording_archive_bucket, interview_recording_archive_prefix")
      .maybeSingle();
    if (error) throw error;
    const { data: audit } = await context.supabase
      .from("interview_retention_audit")
      .select("id, actor_id, previous, next, note, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    return { settings: data as (Settings & { id: string }) | null, audit: (audit ?? []) as Array<{ id: string; actor_id: string | null; previous: Settings; next: Settings; note: string | null; created_at: string }> };
  });

export const updateInterviewRetentionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof SettingsInput>) => SettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context);
    const { data: prev, error: pe } = await context.supabase
      .from("org_settings")
      .select("id, interview_retention_days, interview_recording_archive_enabled, interview_recording_archive_bucket, interview_recording_archive_prefix")
      .maybeSingle();
    if (pe || !prev) throw pe ?? new Error("Settings row missing");
    const previous: Settings = {
      interview_retention_days: prev.interview_retention_days,
      interview_recording_archive_enabled: !!prev.interview_recording_archive_enabled,
      interview_recording_archive_bucket: prev.interview_recording_archive_bucket ?? null,
      interview_recording_archive_prefix: prev.interview_recording_archive_prefix ?? null,
    };
    const next: Settings = {
      interview_retention_days: data.interview_retention_days,
      interview_recording_archive_enabled: data.interview_recording_archive_enabled,
      interview_recording_archive_bucket: data.interview_recording_archive_bucket?.trim() || null,
      interview_recording_archive_prefix: data.interview_recording_archive_prefix?.trim() || null,
    };
    if (next.interview_recording_archive_enabled && !next.interview_recording_archive_bucket) {
      throw new Error("S3 bucket name is required when archiving is enabled.");
    }
    const { error: ue } = await context.supabase
      .from("org_settings")
      .update(next as never)
      .eq("id", prev.id);
    if (ue) throw ue;
    const { error: ae } = await context.supabase
      .from("interview_retention_audit")
      .insert({ actor_id: context.userId, previous: previous as never, next: next as never, note: data.note ?? null } as never);
    if (ae) throw ae;
    return { ok: true };
  });