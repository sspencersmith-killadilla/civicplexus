import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  consent: z.literal(true),
  aivi_ack: z.boolean(),
  device_check: z.object({
    browser: z.string().max(200),
    mic_ok: z.boolean(),
    cam_ok: z.boolean(),
    downlink_mbps: z.number().nullable().optional(),
  }).optional(),
});

export const Route = createFileRoute("/api/public/interview/$token/consent")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { hashInviteToken } = await import("@/lib/interview-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
        const { data: inv } = await supabaseAdmin
          .from("interview_invitations").select("id, expires_at, status").eq("token_hash", hashInviteToken(params.token)).maybeSingle();
        if (!inv) return new Response(JSON.stringify({ error: "Invalid link" }), { status: 404 });
        const i = inv as { id: string; expires_at: string; status: string };
        if (new Date(i.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const ua = request.headers.get("user-agent") ?? null;
        const { error } = await supabaseAdmin.from("interview_invitations").update({
          consent_at: new Date().toISOString(),
          consent_ip: ip,
          consent_user_agent: ua,
          aivi_disclosure_ack_at: parsed.data.aivi_ack ? new Date().toISOString() : null,
          device_check: parsed.data.device_check ?? null,
          status: i.status === "pending" ? "in_progress" : i.status,
        } as never).eq("id", i.id);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});