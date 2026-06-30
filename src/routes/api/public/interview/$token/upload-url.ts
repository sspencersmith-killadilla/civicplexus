import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  question_id: z.string().min(1).max(40),
  take_number: z.number().int().min(1).max(2),
  mime: z.string().min(1).max(100),
});

export const Route = createFileRoute("/api/public/interview/$token/upload-url")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { hashInviteToken } = await import("@/lib/interview-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
        const { data: inv } = await supabaseAdmin
          .from("interview_invitations").select("id, expires_at, consent_at, status")
          .eq("token_hash", hashInviteToken(params.token)).maybeSingle();
        if (!inv) return new Response(JSON.stringify({ error: "Invalid link" }), { status: 404 });
        const i = inv as { id: string; expires_at: string; consent_at: string | null; status: string };
        if (new Date(i.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
        if (!i.consent_at) return new Response(JSON.stringify({ error: "Consent required before recording" }), { status: 412 });
        if (i.status === "submitted") return new Response(JSON.stringify({ error: "Already submitted" }), { status: 409 });
        const { data: takes } = await supabaseAdmin
          .from("interview_responses").select("take_number")
          .eq("invitation_id", i.id).eq("question_id", parsed.data.question_id);
        const existing = ((takes ?? []) as Array<{ take_number: number }>).map((t) => t.take_number);
        if (existing.includes(2)) return new Response(JSON.stringify({ error: "Take 2 was already recorded and is final." }), { status: 409 });
        if (parsed.data.take_number === 1 && existing.includes(1)) return new Response(JSON.stringify({ error: "Take 1 already submitted." }), { status: 409 });
        if (parsed.data.take_number === 2 && !existing.includes(1)) return new Response(JSON.stringify({ error: "Record take 1 first." }), { status: 409 });
        const ext = parsed.data.mime.includes("mp4") ? "mp4" : "webm";
        const path = `${i.id}/${parsed.data.question_id}/take${parsed.data.take_number}.${ext}`;
        const { data: signed, error: sErr } = await supabaseAdmin.storage
          .from("interview-media-oneway").createSignedUploadUrl(path);
        if (sErr || !signed) return new Response(JSON.stringify({ error: sErr?.message || "Failed to sign" }), { status: 500 });
        return Response.json({ upload_url: signed.signedUrl, path, token: signed.token });
      },
    },
  },
});