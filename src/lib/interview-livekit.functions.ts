import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Panelist joins a live interview room. Requires being on the interview's panel or HR/hiring-manager. */
export const joinLiveInterviewRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    interview_id: z.string().uuid(),
    consented: z.boolean(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    if (!data.consented) throw new Error("Consent required to join the recorded interview.");
    const { livekitConfigured, mintLiveKitToken } = await import("@/lib/livekit.server");
    if (!livekitConfigured()) throw new Error("Live interviews are not configured on this server. Ask your admin to set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.");

    const { data: iv, error } = await context.supabase
      .from("interviews")
      .select("id, interviewer_ids, application_id, scheduled_at, stage, job_applications:application_id(applicant_name)")
      .eq("id", data.interview_id)
      .single();
    if (error || !iv) throw new Error("Interview not found");
    const interview = iv as { id: string; interviewer_ids: string[]; scheduled_at: string; stage: string; job_applications: { applicant_name: string } | null };

    const isPanelist = interview.interviewer_ids?.includes(context.userId);
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const roleSet = new Set(((roles ?? []) as Array<{ role: string }>).map((r) => r.role));
    const isManager = roleSet.has("hr_admin") || roleSet.has("hiring_manager");
    if (!isPanelist && !isManager) throw new Error("You are not on this interview panel.");

    // Fetch caller name
    const { data: profile } = await context.supabase
      .from("profiles").select("first_name, last_name, email").eq("id", context.userId).maybeSingle();
    const p = (profile ?? {}) as { first_name?: string | null; last_name?: string | null; email?: string | null };
    const displayName = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Panelist";

    const roomName = `iv_${interview.id}`;

    // Ensure interview_rooms row exists
    const { data: existing } = await context.supabase
      .from("interview_rooms").select("id, consent_log").eq("interview_id", interview.id).maybeSingle();
    let roomId = (existing as { id?: string } | null)?.id;
    if (!roomId) {
      const { data: ins, error: rErr } = await context.supabase.from("interview_rooms").insert({
        interview_id: interview.id,
        livekit_room_name: roomName,
        watermark_text: `${interview.job_applications?.applicant_name ?? "Candidate"} • ${new Date(interview.scheduled_at).toLocaleString()}`,
      } as never).select("id").single();
      if (rErr) throw new Error(rErr.message);
      roomId = (ins as { id: string }).id;
    }

    // Append consent entry
    const log = (((existing as { consent_log?: unknown[] } | null)?.consent_log ?? []) as Array<Record<string, unknown>>);
    log.push({
      identity: context.userId,
      name: displayName,
      role: "panelist",
      consented_at: new Date().toISOString(),
    });
    await context.supabase.from("interview_rooms").update({ consent_log: log } as never).eq("id", roomId!);

    const { token, url } = await mintLiveKitToken({
      room: roomName,
      identity: context.userId,
      name: displayName,
      canPublish: true,
      metadata: { role: "panelist" },
      ttlSeconds: 60 * 60 * 4,
    });
    return { token, url, room: roomName, room_id: roomId, watermark: `${displayName} • ${new Date().toLocaleString()}` };
  });