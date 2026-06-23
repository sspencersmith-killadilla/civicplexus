import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

const DEMO_PASSWORD = "Demo, 1234";

export const Route = createFileRoute("/api/public/hooks/reset-demo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.REMINDERS_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook not configured", { status: 503 });
        const signature = request.headers.get("x-webhook-signature") ?? "";
        const body = await request.text();
        const expected = createHmac("sha256", secret).update(body || "{}").digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfg } = await supabaseAdmin
          .from("demo_config").select("demo_user_id").eq("id", true).maybeSingle();
        if (!cfg?.demo_user_id) {
          return Response.json({ ok: true, skipped: "no demo user provisioned" });
        }
        const { data, error } = await supabaseAdmin.rpc("restore_demo_changes");
        if (error) return new Response(error.message, { status: 500 });
        await supabaseAdmin.auth.admin.updateUserById(cfg.demo_user_id, { password: DEMO_PASSWORD });
        return Response.json({ ok: true, result: data });
      },
    },
  },
});