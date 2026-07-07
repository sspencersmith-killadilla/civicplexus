import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/leave-accruals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // pg_cron authenticates with the Supabase anon key in the `apikey` header.
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runLeaveAccruals } = await import("@/lib/leave-accruals.server");
        try {
          const result = await runLeaveAccruals(supabaseAdmin);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "accrual failure";
          return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "content-type": "application/json" } });
        }
      },
    },
  },
});