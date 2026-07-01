import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/lms-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { performSync } = await import("@/lib/lms-connections.functions");
        const { data: conns } = await supabaseAdmin
          .from("lms_connections")
          .select("id")
          .eq("enabled", true);
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const c of ((conns ?? []) as Array<{ id: string }>)) {
          try {
            await performSync(c.id, "cron");
            results.push({ id: c.id, ok: true });
          } catch (e) {
            results.push({ id: c.id, ok: false, error: (e as Error).message });
          }
        }
        return new Response(JSON.stringify({ ran: results.length, results }), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});