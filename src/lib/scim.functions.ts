import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireHrAdmin } from "@/lib/role-check.server";
import { createHash, randomBytes } from "crypto";

function hashToken(t: string) { return createHash("sha256").update(t).digest("hex"); }

export const mintScimToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { provider_id: string; label: string; expires_days?: number }) =>
    z.object({ provider_id: z.string().uuid(), label: z.string().min(1), expires_days: z.number().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireHrAdmin(context.supabase, context.userId);
    const raw = randomBytes(32).toString("base64url");
    const token = `scim_${raw}`;
    const { error } = await context.supabase.from("scim_tokens").insert({
      provider_id: data.provider_id,
      label: data.label,
      token_hash: hashToken(token),
      token_prefix: token.slice(0, 12),
      created_by: context.userId,
      expires_at: data.expires_days ? new Date(Date.now() + data.expires_days * 86400000).toISOString() : null,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

export const revokeScimToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scim_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replayProvisioningEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("provisioning_events")
      .update({ status: "queued", error: null, processed_at: null }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
