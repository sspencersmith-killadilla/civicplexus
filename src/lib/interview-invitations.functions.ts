import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Mint a one-way interview invitation for an applicant and return the candidate URL. */
export const createInterviewInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    application_id: z.string().uuid(),
    kit_id: z.string().uuid(),
    days_valid: z.number().int().min(1).max(60).default(14),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { generateInviteToken, getAppBaseUrl } = await import("@/lib/interview-tokens.server");
    const { data: kit, error: kErr } = await context.supabase
      .from("interview_kits").select("kind, default_retention_days").eq("id", data.kit_id).single();
    if (kErr || !kit) throw new Error(kErr?.message || "Kit not found");
    const k = kit as { kind: "one_way" | "live"; default_retention_days: number };

    const { data: app, error: aErr } = await context.supabase
      .from("job_applications").select("requisition_id").eq("id", data.application_id).single();
    if (aErr || !app) throw new Error("Application not found");
    const requisition_id = (app as { requisition_id: string }).requisition_id;

    const { token, hash } = generateInviteToken();
    const expires_at = new Date(Date.now() + data.days_valid * 86400000).toISOString();

    const { data: ins, error } = await context.supabase
      .from("interview_invitations")
      .insert({
        application_id: data.application_id,
        requisition_id,
        kit_id: data.kit_id,
        kind: k.kind,
        token_hash: hash,
        status: "pending",
        expires_at,
        retention_days: k.default_retention_days,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      invitation_id: (ins as { id: string }).id,
      url: `${getAppBaseUrl()}/candidate/${token}/interview`,
      token,
      expires_at,
    };
  });

/** Approve a candidate accommodation request (HR / hiring manager). */
export const approveAccommodation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ invitation_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("interview_invitations")
      .update({ accommodation_approved_at: new Date().toISOString() } as never)
      .eq("id", data.invitation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Get a short-lived signed URL to play a recorded response. Audited. */
export const getResponseSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ response_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: resp, error } = await context.supabase
      .from("interview_responses").select("media_object_path, invitation_id").eq("id", data.response_id).single();
    if (error || !resp) throw new Error("Response not found");
    const r = resp as { media_object_path: string | null; invitation_id: string };
    if (!r.media_object_path) throw new Error("No recording");
    const { data: url, error: sErr } = await context.supabase.storage
      .from("interview-media-oneway")
      .createSignedUrl(r.media_object_path, 60 * 30);
    if (sErr || !url) throw new Error(sErr?.message || "Failed to sign");
    await context.supabase.from("interview_recording_access").insert({
      recording_object_path: r.media_object_path,
      context: "one_way_response",
      context_id: data.response_id,
      viewed_by: context.userId,
      signed_url_expires_at: new Date(Date.now() + 60 * 30 * 1000).toISOString(),
    } as never);
    return { url: url.signedUrl };
  });

/** Process a candidate DSR (delete recordings + transcripts, or export bundle). */
export const processInterviewDsr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    dsr_id: z.string().uuid(),
    action: z.enum(["complete", "reject"]),
    notes: z.string().max(2000).optional().or(z.literal("")),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: dsr, error } = await context.supabase
      .from("interview_dsr_requests").select("*").eq("id", data.dsr_id).single();
    if (error || !dsr) throw new Error("DSR not found");
    const d = dsr as { id: string; kind: "export" | "delete"; invitation_id: string | null };
    if (data.action === "complete" && d.kind === "delete" && d.invitation_id) {
      const { data: resps } = await context.supabase
        .from("interview_responses").select("id, media_object_path").eq("invitation_id", d.invitation_id);
      const paths = ((resps ?? []) as Array<{ media_object_path: string | null }>)
        .map((r) => r.media_object_path).filter((p): p is string => !!p);
      if (paths.length) {
        await context.supabase.storage.from("interview-media-oneway").remove(paths);
      }
      await context.supabase
        .from("interview_responses")
        .update({ transcript: null, captions_vtt_path: null, media_object_path: null } as never)
        .eq("invitation_id", d.invitation_id);
    }
    const { error: uErr } = await context.supabase.from("interview_dsr_requests").update({
      status: data.action === "complete" ? "completed" : "rejected",
      processed_at: new Date().toISOString(),
      processed_by: context.userId,
      notes: data.notes || null,
    } as never).eq("id", data.dsr_id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });