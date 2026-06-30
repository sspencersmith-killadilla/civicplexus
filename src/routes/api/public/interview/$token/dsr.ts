import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  kind: z.enum(["export", "delete"]),
  email: z.string().email().max(255).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const Route = createFileRoute("/api/public/interview/$token/dsr")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { hashInviteToken } = await import("@/lib/interview-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
        const { data: inv } = await supabaseAdmin
          .from("interview_invitations").select("id, application_id").eq("token_hash", hashInviteToken(params.token)).maybeSingle();
        if (!inv) return new Response(JSON.stringify({ error: "Invalid" }), { status: 404 });
        const i = inv as { id: string; application_id: string };
        const { error } = await supabaseAdmin.from("interview_dsr_requests").insert({
          invitation_id: i.id,
          application_id: i.application_id,
          kind: parsed.data.kind,
          requested_email: parsed.data.email || null,
          notes: parsed.data.notes || null,
        } as never);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});