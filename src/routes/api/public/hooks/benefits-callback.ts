import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const Schema = z.object({
  handoff_id: z.string().uuid(),
  status: z.enum(["pending", "sent", "enrolled", "declined", "completed"]),
  external_ref: z.string().max(255).optional(),
});

export const Route = createFileRoute("/api/public/hooks/benefits-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.BENEFITS_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 503 });
        const signature = request.headers.get("x-webhook-signature");
        const body = await request.text();
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sig = Buffer.from(signature ?? "");
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("Invalid signature", { status: 401 });
        }
        const parsed = Schema.safeParse(JSON.parse(body));
        if (!parsed.success) return new Response("Bad payload", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("benefits_handoffs").update({
          status: parsed.data.status,
          external_ref: parsed.data.external_ref ?? null,
        }).eq("id", parsed.data.handoff_id);
        return Response.json({ ok: true });
      },
    },
  },
});