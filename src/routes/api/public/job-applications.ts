import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  requisition_id: z.string().uuid(),
  applicant_name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  cover_letter: z.string().trim().max(20000).optional().nullable(),
  answers: z.record(z.string(), z.any()).optional().nullable(),
  supplemental_answers: z.record(z.string(), z.any()).optional().nullable(),
  self_id: z
    .object({
      gender: z.string().max(40).optional().nullable(),
      race_ethnicity: z.string().max(80).optional().nullable(),
      veteran_status: z.string().max(80).optional().nullable(),
      disability_status: z.string().max(80).optional().nullable(),
      declined: z.boolean().optional(),
    })
    .optional()
    .nullable(),
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
            const rawSelfId = fd.get("self_id");
            let selfId: z.infer<typeof Body>["self_id"] = null;
            if (typeof rawSelfId === "string" && rawSelfId.length > 0) {
              try { selfId = JSON.parse(rawSelfId); } catch { selfId = null; }
            }
            const rawAnswers = fd.get("answers");
            let answers: Record<string, unknown> | null = null;
            if (typeof rawAnswers === "string" && rawAnswers.length > 0) {
              try { answers = JSON.parse(rawAnswers); } catch { answers = null; }
            }
            const rawSupp = fd.get("supplemental_answers");
            let suppAnswers: Record<string, unknown> | null = null;
            if (typeof rawSupp === "string" && rawSupp.length > 0) {
              try { suppAnswers = JSON.parse(rawSupp); } catch { suppAnswers = null; }
            }
            parsed = Body.parse({
              requisition_id: fd.get("requisition_id"),
              applicant_name: fd.get("applicant_name"),
              email: fd.get("email"),
              phone: fd.get("phone") || undefined,
              cover_letter: fd.get("cover_letter") || undefined,
              answers,
              supplemental_answers: suppAnswers,
              self_id: selfId,
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
          let resumeBytes: Uint8Array | null = null;
          let resumeIsPdf = false;
          if (resumeFile) {
            const ext = resumeFile.name.split(".").pop()?.toLowerCase() ?? "bin";
            const path = `${parsed.requisition_id}/${crypto.randomUUID()}.${ext}`;
            const ab = await resumeFile.arrayBuffer();
            resumeBytes = new Uint8Array(ab);
            resumeIsPdf =
              (resumeFile.type || "").toLowerCase() === "application/pdf" ||
              ext === "pdf";
            const { error: upErr } = await supabaseAdmin.storage.from("job-applications").upload(path, resumeBytes, {
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
            answers: parsed.answers ?? {},
            supplemental_answers: parsed.supplemental_answers ?? {},
          } as never).select().single();
          if (insErr) return j({ error: insErr.message }, 500);
          const a = app as { id: string };

          await supabaseAdmin.from("job_application_events" as never).insert({
            application_id: a.id, event_type: "submitted",
          } as never);

          // Best-effort: extract text from PDF resumes for HR search / AI screening.
          if (resumeBytes && resumeIsPdf) {
            try {
              const { extractPdfText } = await import("@/lib/pdf-text.server");
              const { text, pages, truncated } = await extractPdfText(resumeBytes);
              if (text.trim().length > 0) {
                await supabaseAdmin.from("application_ai_parse" as never).upsert({
                  application_id: a.id,
                  parsed: { resume_text: text, pages, truncated, source: "pdf" },
                  model: "unpdf",
                  redaction_version: "v1",
                } as never, { onConflict: "application_id" });
              }
            } catch { /* ignore — extraction is non-blocking */ }
          }

          // Voluntary self-identification — written atomically with the
          // application via the trusted server route, so external candidates
          // never need an anon-callable insert path of their own.
          if (parsed.self_id && (parsed.self_id.declined
            || parsed.self_id.gender || parsed.self_id.race_ethnicity
            || parsed.self_id.veteran_status || parsed.self_id.disability_status)) {
            await supabaseAdmin.from("application_self_id" as never).upsert({
              application_id: a.id,
              gender: parsed.self_id.gender || null,
              race_ethnicity: parsed.self_id.race_ethnicity || null,
              veteran_status: parsed.self_id.veteran_status || null,
              disability_status: parsed.self_id.disability_status || null,
              declined: parsed.self_id.declined ?? false,
            } as never, { onConflict: "application_id" });
          }

          const { generateToken, getAppBaseUrl } = await import("@/lib/candidate-tokens.server");
          const { token, hash } = generateToken();
          const tokenExpiresAt = new Date(Date.now() + 60 * 86400000).toISOString();
          const { error: tokenErr } = await supabaseAdmin.from("candidate_tokens" as never).insert({
            application_id: a.id,
            token_hash: hash,
            purpose: "portal",
            expires_at: tokenExpiresAt,
          } as never);
          if (tokenErr) return j({ error: "Application submitted, but portal setup failed" }, 500);
          const portalPath = `/candidate/${token}`;
          const portalUrl = `${getAppBaseUrl(request)}${portalPath}`;

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
              body: `Hi ${parsed.applicant_name},\n\nThanks for applying! We've received your application and will be in touch.\n\nYou can track your status and message the recruiting team here:\n${portalUrl}`,
            });
          } catch { /* ignore */ }

          return j({ id: a.id, portal_token: token, portal_path: portalPath, portal_url: portalUrl, portal_expires_at: tokenExpiresAt }, 200);
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