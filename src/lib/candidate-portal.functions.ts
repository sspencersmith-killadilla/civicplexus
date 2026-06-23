import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** HR mints a portal token for a given application and returns the URL. */
export const mintCandidatePortalToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ application_id: z.string().uuid(), days_valid: z.number().int().min(1).max(180).default(60) }).parse(i))
  .handler(async ({ data, context }) => {
    const { generateToken, getAppBaseUrl } = await import("./candidate-tokens.server");
    const { token, hash } = generateToken();
    const expires = new Date(Date.now() + data.days_valid * 86400000).toISOString();
    const { error } = await context.supabase.from("candidate_tokens" as never).insert({
      application_id: data.application_id, token_hash: hash, purpose: "portal", expires_at: expires,
    } as never);
    if (error) throw new Error(error.message);
    return { url: `${getAppBaseUrl()}/candidate/${token}`, token, expires_at: expires };
  });

export const postRecruiterMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ application_id: z.string().uuid(), body: z.string().min(1).max(5000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("application_messages" as never).insert({
      application_id: data.application_id, sender: "recruiter", sender_user_id: context.userId, body: data.body,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });