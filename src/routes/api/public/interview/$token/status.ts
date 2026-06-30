import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/interview/$token/status")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { hashInviteToken } = await import("@/lib/interview-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = hashInviteToken(params.token);
        const { data: inv } = await supabaseAdmin
          .from("interview_invitations")
          .select("id, application_id, kit_id, kind, status, expires_at, consent_at, aivi_disclosure_ack_at, accommodation_request, accommodation_approved_at, retention_days")
          .eq("token_hash", hash).maybeSingle();
        if (!inv) return new Response(JSON.stringify({ error: "Invalid link" }), { status: 404 });
        const i = inv as { id: string; application_id: string; kit_id: string; kind: string; status: string; expires_at: string; consent_at: string | null; aivi_disclosure_ack_at: string | null; accommodation_request: unknown; accommodation_approved_at: string | null; retention_days: number };
        if (new Date(i.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Link expired" }), { status: 410 });
        if (i.status === "revoked") return new Response(JSON.stringify({ error: "Link revoked" }), { status: 410 });
        const { data: kit } = await supabaseAdmin
          .from("interview_kits").select("name, description, questions, ai_assist_default").eq("id", i.kit_id).single();
        const { data: app } = await supabaseAdmin
          .from("job_applications").select("applicant_name, email, requisition_id").eq("id", i.application_id).single();
        const a = app as { applicant_name: string; email: string; requisition_id: string };
        const { data: req } = await supabaseAdmin
          .from("job_requisitions").select("title, department, location").eq("id", a.requisition_id).single();
        const { data: responses } = await supabaseAdmin
          .from("interview_responses").select("question_id, take_number, is_final, duration_seconds").eq("invitation_id", i.id);
        return Response.json({ invitation: i, kit, application: a, requisition: req, responses: responses ?? [] });
      },
    },
  },
});