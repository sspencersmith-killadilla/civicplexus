import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/interview/$token/finalize")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const { hashInviteToken } = await import("@/lib/interview-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: inv } = await supabaseAdmin
          .from("interview_invitations").select("id, kit_id, application_id, status, expires_at")
          .eq("token_hash", hashInviteToken(params.token)).maybeSingle();
        if (!inv) return new Response(JSON.stringify({ error: "Invalid" }), { status: 404 });
        const i = inv as { id: string; kit_id: string; application_id: string; status: string; expires_at: string };
        if (new Date(i.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
        const { data: kit } = await supabaseAdmin.from("interview_kits").select("questions").eq("id", i.kit_id).single();
        const questions = ((kit as { questions: Array<{ id: string }> } | null)?.questions ?? []);
        const { data: responses } = await supabaseAdmin
          .from("interview_responses").select("question_id, is_final").eq("invitation_id", i.id);
        const finalByQ = new Map<string, boolean>();
        ((responses ?? []) as Array<{ question_id: string; is_final: boolean }>).forEach((r) => {
          if (r.is_final) finalByQ.set(r.question_id, true);
        });
        const missing = questions.filter((q) => !finalByQ.get(q.id));
        if (missing.length) return new Response(JSON.stringify({ error: `Missing final take for: ${missing.map((m) => m.id).join(", ")}` }), { status: 400 });
        await supabaseAdmin.from("interview_invitations").update({
          status: "submitted", submitted_at: new Date().toISOString(),
        } as never).eq("id", i.id);
        await supabaseAdmin.from("job_application_events").insert({
          application_id: i.application_id,
          event_type: "interview_submitted",
          meta: { invitation_id: i.id, kind: "one_way" },
        } as never);
        return Response.json({ ok: true });
      },
    },
  },
});