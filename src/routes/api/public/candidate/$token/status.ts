import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/candidate/$token/status")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { hashToken } = await import("@/lib/candidate-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = hashToken(params.token);
        const { data: tok } = await supabaseAdmin
          .from("candidate_tokens")
          .select("application_id, expires_at, revoked_at, purpose")
          .eq("token_hash", hash)
          .maybeSingle();
        if (!tok) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 404 });
        const t = tok as { application_id: string; expires_at: string; revoked_at: string | null; purpose: string };
        if (t.revoked_at || new Date(t.expires_at) < new Date()) {
          return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
        }
        const { data: app } = await supabaseAdmin
          .from("job_applications")
          .select("id, applicant_name, email, status, created_at, requisition_id")
          .eq("id", t.application_id).single();
        const { data: req } = await supabaseAdmin
          .from("job_requisitions")
          .select("title, department, location, employment_type")
          .eq("id", (app as { requisition_id: string }).requisition_id).single();
        const { data: interviews } = await supabaseAdmin
          .from("interviews")
          .select("id, scheduled_at, duration_minutes, stage, location, interviewer_ids")
          .eq("application_id", t.application_id)
          .order("scheduled_at", { ascending: true });
        const { data: offers } = await supabaseAdmin
          .from("offers")
          .select("id, status, salary, start_date, expires_at, sent_at")
          .eq("application_id", t.application_id).order("created_at", { ascending: false });
        const { data: messages } = await supabaseAdmin
          .from("application_messages")
          .select("id, sender, body, created_at")
          .eq("application_id", t.application_id)
          .order("created_at", { ascending: true });
        return Response.json({ application: app, requisition: req, interviews, offers, messages, expires_at: t.expires_at });
      },
    },
  },
});