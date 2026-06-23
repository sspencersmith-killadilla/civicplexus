import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  decision: z.enum(["accept", "decline"]),
  signature_name: z.string().min(2).max(120).optional(),
  decline_reason: z.string().max(2000).optional(),
});

export const Route = createFileRoute("/api/public/offers/$token/respond")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { hashToken } = await import("@/lib/candidate-tokens.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400 });
        const { data: tok } = await supabaseAdmin
          .from("candidate_tokens")
          .select("application_id, expires_at, revoked_at, purpose")
          .eq("token_hash", hashToken(params.token)).maybeSingle();
        if (!tok) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 404 });
        const t = tok as { application_id: string; expires_at: string; revoked_at: string | null; purpose: string };
        if (t.purpose !== "offer" || t.revoked_at || new Date(t.expires_at) < new Date()) {
          return new Response(JSON.stringify({ error: "Expired" }), { status: 410 });
        }

        const { data: offer } = await supabaseAdmin
          .from("offers")
          .select("id, status, worker_type_id, start_date, application_id, job_applications:application_id(applicant_name, email, requisition_id, job_requisitions:requisition_id(title, department, hiring_manager_id))")
          .eq("application_id", t.application_id)
          .eq("status", "sent")
          .order("sent_at", { ascending: false }).limit(1).maybeSingle();
        if (!offer) return new Response(JSON.stringify({ error: "Offer not found" }), { status: 404 });
        const o = offer as unknown as { id: string; status: string; worker_type_id: string; start_date: string | null; application_id: string; job_applications: { applicant_name: string; email: string; requisition_id: string; job_requisitions: { title: string; department: string | null; hiring_manager_id: string | null } | null } | null };

        if (parsed.data.decision === "decline") {
          await supabaseAdmin.from("offers").update({
            status: "declined", decline_reason: parsed.data.decline_reason ?? null, signed_at: new Date().toISOString(),
          }).eq("id", o.id);
          await supabaseAdmin.from("candidate_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hashToken(params.token));
          await supabaseAdmin.from("job_application_events").insert({
            application_id: o.application_id, actor_id: null, event_type: "offer_declined",
            payload: { decline_reason: parsed.data.decline_reason ?? null },
          });
          return Response.json({ ok: true, status: "declined" });
        }

        // Accept path - typed-name e-signature recorded directly on the offer
        if (!parsed.data.signature_name) return new Response(JSON.stringify({ error: "Signature required" }), { status: 400 });
        await supabaseAdmin.from("offers").update({
          status: "accepted", signed_at: new Date().toISOString(),
        }).eq("id", o.id);
        await supabaseAdmin.from("candidate_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hashToken(params.token));

        // Build hire request via RPC
        const fullName = o.job_applications?.applicant_name ?? parsed.data.signature_name;
        const [firstName, ...rest] = fullName.split(" ");
        const lastName = rest.join(" ") || "—";
        const { data: hireId } = await supabaseAdmin.rpc("create_hire_request", {
          _first_name: firstName,
          _last_name: lastName,
          _email: o.job_applications?.email ?? "",
          _job_title: o.job_applications?.job_requisitions?.title ?? "",
          _department: o.job_applications?.job_requisitions?.department ?? "",
          _worker_type_id: o.worker_type_id,
          _start_date: o.start_date ?? new Date().toISOString().slice(0, 10),
          _reason: "Auto-generated from accepted offer",
          _notes: "Candidate accepted offer via portal",
        });

        await supabaseAdmin.from("job_application_events").insert({
          application_id: o.application_id, actor_id: null, event_type: "offer_accepted",
          payload: {
            hire_request_id: hireId,
            signer_name: parsed.data.signature_name,
            signer_ip: request.headers.get("x-forwarded-for") ?? null,
            signer_ua: request.headers.get("user-agent") ?? null,
          },
        });
        await supabaseAdmin.from("job_applications").update({ status: "hired" }).eq("id", o.application_id);

        return Response.json({ ok: true, status: "accepted" });
      },
    },
  },
});