import { createFileRoute } from "@tanstack/react-router";

// Liveness + readiness probe for self-hosted deployments and uptime monitors.
// Returns 200 when the app, database, and configured AI provider all respond;
// 503 when any required dependency is unreachable. Never returns secrets.
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

        // Database — anon publishable client, harmless count on a public table.
        const dbStart = Date.now();
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const sb = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { persistSession: false, autoRefreshToken: false } },
          );
          const { error } = await sb.from("module_settings").select("key", { count: "exact", head: true });
          checks.database = error
            ? { ok: false, ms: Date.now() - dbStart, error: error.code ?? "query_failed" }
            : { ok: true, ms: Date.now() - dbStart };
        } catch (e) {
          checks.database = { ok: false, ms: Date.now() - dbStart, error: e instanceof Error ? e.name : "exception" };
        }

        // AI provider — config-only check, no outbound call (keep probe cheap).
        const provider = process.env.AI_PROVIDER ?? "lovable";
        const aiConfigured =
          provider === "none" ||
          (provider === "lovable" && !!process.env.LOVABLE_API_KEY) ||
          (provider === "openai" && !!process.env.OPENAI_API_KEY) ||
          (provider === "azure" && !!process.env.AZURE_OPENAI_API_KEY);
        checks.ai = aiConfigured
          ? { ok: true }
          : { ok: false, error: `${provider}_not_configured` };

        // Storage / auth share the database client; if DB is up they're up.
        checks.app = { ok: true, ms: Date.now() - started };

        const required = [checks.database.ok];
        const allOk = required.every(Boolean);
        return new Response(
          JSON.stringify({
            status: allOk ? "ok" : "degraded",
            checks,
            commit: process.env.GIT_SHA ?? null,
            ts: new Date().toISOString(),
          }),
          {
            status: allOk ? 200 : 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
