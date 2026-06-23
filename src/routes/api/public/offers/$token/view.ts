import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/offers/$token/view")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { hashToken } = await import("@/lib/candidate-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tok } = await supabaseAdmin
          .from("candidate_tokens")
          .select("application_id, expires_at, revoked_at, purpose")
          .eq("token_hash", hashToken(params.token)).maybeSingle();
        if (!tok) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 404 });
        const t = tok as { application_id: string; expires_at: string; revoked_at: string | null; purpose: string };
        if (t.purpose !== "offer") return new Response(JSON.stringify({ error: "Wrong token type" }), { status: 403 });
        if (t.revoked_at || new Date(t.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
        const { data: offer } = await supabaseAdmin
          .from("offers")
          .select("id, status, salary, pay_grade, start_date, expires_at, letter_html, application_id, job_applications:application_id(applicant_name, email, job_requisitions:requisition_id(title))")
          .eq("application_id", t.application_id)
          .eq("status", "sent")
          .order("sent_at", { ascending: false })
          .limit(1).maybeSingle();
        if (!offer) return new Response(JSON.stringify({ error: "Offer not found" }), { status: 404 });
        return Response.json({ offer });
      },
    },
  },
});