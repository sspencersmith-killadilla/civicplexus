import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ body: z.string().trim().min(1).max(5000) });

export const Route = createFileRoute("/api/public/candidate/$token/message")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { hashToken } = await import("@/lib/candidate-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
        const { data: tok } = await supabaseAdmin
          .from("candidate_tokens")
          .select("application_id, expires_at, revoked_at")
          .eq("token_hash", hashToken(params.token)).maybeSingle();
        if (!tok) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 404 });
        const t = tok as { application_id: string; expires_at: string; revoked_at: string | null };
        if (t.revoked_at || new Date(t.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
        const { error } = await supabaseAdmin.from("application_messages").insert({
          application_id: t.application_id, sender: "candidate", body: parsed.data.body,
        });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});