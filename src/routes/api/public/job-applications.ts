import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  requisition_id: z.string().uuid(),
  applicant_name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  cover_letter: z.string().trim().max(20000).optional().nullable(),
});

export const Route = createFileRoute("/api/public/job-applications")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get("content-type") ?? "";
          let parsed: z.infer<typeof Body>;
          let resumeFile: File | null = null;
          if (ct.includes("multipart/form-data")) {
            const fd = await request.formData();
            parsed = Body.parse({
              requisition_id: fd.get("requisition_id"),
              applicant_name: fd.get("applicant_name"),
              email: fd.get("email"),
              phone: fd.get("phone") || undefined,
              cover_letter: fd.get("cover_letter") || undefined,
            });
            const f = fd.get("resume");
            if (f instanceof File && f.size > 0) {
              if (f.size > 5 * 1024 * 1024) return j({ error: "Resume too large (max 5MB)" }, 400);
              resumeFile = f;
            }
          } else {
            parsed = Body.parse(await request.json());
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Verify requisition is posted and public
          const { data: req } = await supabaseAdmin.from("job_requisitions" as never)
            .select("id, status, internal_only").eq("id", parsed.requisition_id).maybeSingle();
          const r = req as { id: string; status: string; internal_only: boolean } | null;
          if (!r || r.status !== "posted" || r.internal_only) return j({ error: "Position not available" }, 400);

          let resumeUrl: string | null = null;
          if (resumeFile) {
            const ext = resumeFile.name.split(".").pop()?.toLowerCase() ?? "bin";
            const path = `${parsed.requisition_id}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabaseAdmin.storage.from("job-applications").upload(path, resumeFile, {
              contentType: resumeFile.type || undefined,
            });
            if (upErr) return j({ error: "Resume upload failed" }, 500);
            resumeUrl = path;
          }

          const { data: app, error: insErr } = await supabaseAdmin.from("job_applications" as never).insert({
            requisition_id: parsed.requisition_id,
            applicant_name: parsed.applicant_name,
            email: parsed.email,
            phone: parsed.phone ?? null,
            cover_letter: parsed.cover_letter ?? null,
            resume_url: resumeUrl,
            source: "public",
            is_internal: false,
          } as never).select().single();
          if (insErr) return j({ error: insErr.message }, 500);
          const a = app as { id: string };

          await supabaseAdmin.from("job_application_events" as never).insert({
            application_id: a.id, event_type: "submitted",
          } as never);

          // Notify HR
          const { data: hr } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "hr_admin");
          for (const row of (hr ?? []) as Array<{ user_id: string }>) {
            await supabaseAdmin.from("notifications").insert({
              user_id: row.user_id, type: "job_application", title: "New application received",
              body: `${parsed.applicant_name} applied for a posted role`,
              link: `/jobs/${parsed.requisition_id}`,
            });
          }

          // Email confirmation (best-effort)
          try {
            const { sendApplicantEmail } = await import("@/lib/applicant-emails.functions");
            await sendApplicantEmail({
              to: parsed.email,
              subject: "Application received",
              body: `Hi ${parsed.applicant_name},\n\nThanks for applying! We've received your application and will be in touch.`,
            });
          } catch { /* ignore */ }

          return j({ id: a.id }, 200);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Bad request";
          return j({ error: msg }, 400);
        }
      },
    },
  },
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}
function j(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders() } });
}