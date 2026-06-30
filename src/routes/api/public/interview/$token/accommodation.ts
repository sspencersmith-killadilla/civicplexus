import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  request: z.string().trim().min(1).max(2000),
  extra_think_seconds: z.number().int().min(0).max(600).default(0),
  extra_answer_seconds: z.number().int().min(0).max(600).default(0),
  captions_required: z.boolean().default(true),
});

export const Route = createFileRoute("/api/public/interview/$token/accommodation")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { hashInviteToken } = await import("@/lib/interview-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
        const { data: inv } = await supabaseAdmin
          .from("interview_invitations").select("id, expires_at").eq("token_hash", hashInviteToken(params.token)).maybeSingle();
        if (!inv) return new Response(JSON.stringify({ error: "Invalid link" }), { status: 404 });
        const i = inv as { id: string; expires_at: string };
        if (new Date(i.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
        const { error } = await supabaseAdmin.from("interview_invitations").update({
          accommodation_request: parsed.data,
        } as never).eq("id", i.id);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});