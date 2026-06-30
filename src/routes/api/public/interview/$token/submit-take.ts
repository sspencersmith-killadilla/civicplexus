import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  question_id: z.string().min(1).max(40),
  take_number: z.number().int().min(1).max(2),
  path: z.string().min(1).max(500),
  mime: z.string().min(1).max(100),
  duration_seconds: z.number().int().min(1).max(900),
  set_final: z.boolean().default(false),
});

export const Route = createFileRoute("/api/public/interview/$token/submit-take")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { hashInviteToken } = await import("@/lib/interview-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
        const { data: inv } = await supabaseAdmin
          .from("interview_invitations").select("id, kit_id, expires_at, consent_at")
          .eq("token_hash", hashInviteToken(params.token)).maybeSingle();
        if (!inv) return new Response(JSON.stringify({ error: "Invalid link" }), { status: 404 });
        const i = inv as { id: string; kit_id: string; expires_at: string; consent_at: string | null };
        if (new Date(i.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
        if (!i.consent_at) return new Response(JSON.stringify({ error: "Consent required" }), { status: 412 });
        // Server enforced: take 2 is automatically final.
        const isFinal = parsed.data.take_number === 2 ? true : parsed.data.set_final;
        const { error } = await supabaseAdmin.from("interview_responses").upsert({
          invitation_id: i.id,
          question_id: parsed.data.question_id,
          take_number: parsed.data.take_number,
          is_final: isFinal,
          media_object_path: parsed.data.path,
          media_mime: parsed.data.mime,
          duration_seconds: parsed.data.duration_seconds,
        } as never, { onConflict: "invitation_id,question_id,take_number" } as never);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        if (parsed.data.take_number === 1 && isFinal) {
          await supabaseAdmin.from("interview_responses").update({ is_final: false } as never)
            .eq("invitation_id", i.id).eq("question_id", parsed.data.question_id).eq("take_number", 2);
        }
        return Response.json({ ok: true, is_final: isFinal });
      },
    },
  },
});