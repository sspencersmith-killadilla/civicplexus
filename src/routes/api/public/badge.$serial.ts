import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function page(title: string, html: string, color: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
 body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fbf9f4;color:#1a1a1a;min-height:100vh;display:grid;place-items:center;padding:24px}
 .card{max-width:420px;width:100%;background:#fff;border:1px solid #e7e2d6;border-radius:14px;padding:32px;box-shadow:0 30px 60px -40px rgba(20,30,60,.18);text-align:center}
 .dot{width:64px;height:64px;border-radius:999px;background:${color};margin:0 auto 16px;display:grid;place-items:center;color:#fff;font-size:32px;font-weight:700}
 h1{font-family:Georgia,serif;font-size:22px;margin:0 0 6px}
 p{margin:6px 0;color:#5b5b5b;font-size:14px}
 .name{font-size:18px;color:#1a1a1a;margin-top:10px}
 .serial{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#5b5b5b;margin-top:14px}
</style></head><body><div class="card">${html}</div></body></html>`;
}

export const Route = createFileRoute("/api/public/badge/$serial")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const serial = (params.serial ?? "").trim();
        if (!/^[A-Za-z0-9-]{4,64}$/.test(serial)) {
          return new Response(page("Invalid badge", `<div class="dot" style="background:#a33">!</div><h1>Invalid badge</h1><p>The badge code is not recognized.</p>`, "#a33"), { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
        }
        const supa = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } });
        const { data } = await supa.from("public_badge_verify" as never).select("serial, display_name, status, issued_at").eq("serial", serial).maybeSingle();
        const row = data as { serial: string; display_name: string | null; status: string | null; issued_at: string | null } | null;
        if (!row) {
          return new Response(page("Badge not found", `<div class="dot" style="background:#a33">×</div><h1>Not on file</h1><p>This serial does not match an issued badge.</p><p class="serial">${serial}</p>`, "#a33"), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
        }
        const ok = row.status === "valid";
        const color = ok ? "#1f8a4c" : "#a33";
        const html = `<div class="dot">${ok ? "✓" : "×"}</div>
<h1>${ok ? "Valid badge" : "Revoked badge"}</h1>
<p>${ok ? "This badge is active and issued by the organization." : "This badge has been revoked. Please verify identity another way."}</p>
<div class="name">${row.display_name ?? "—"}</div>
<p class="serial">SN ${row.serial}${row.issued_at ? ` · issued ${new Date(row.issued_at).toLocaleDateString()}` : ""}</p>`;
        return new Response(page(ok ? "Valid badge" : "Revoked badge", html, color), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      },
    },
  },
});