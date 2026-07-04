import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Interest = z.object({
  body_id: z.string().uuid(),
  is_primary: z.boolean().optional(),
});

const Body = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(50).optional().nullable(),
  postal_code: z.string().trim().max(20).optional().nullable(),
  employer: z.string().trim().max(200).optional().nullable(),
  occupation: z.string().trim().max(200).optional().nullable(),
  qualifications: z.string().trim().max(4000).optional().nullable(),
  statement: z.string().trim().max(6000).optional().nullable(),
  conflicts_disclosure: z.string().trim().max(2000).optional().nullable(),
  interests: z.array(Interest).min(1).max(20),
  primary_body_id: z.string().uuid().optional().nullable(),
  form_data: z.record(z.string(), z.unknown()).optional().default({}),
  hp: z.string().optional(), // honeypot
});

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}
function j(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors() } });
}

export const Route = createFileRoute("/api/public/board-applications")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get("content-type") ?? "";
          let parsed: z.infer<typeof Body>;
          let coverFile: File | null = null;
          if (ct.includes("multipart/form-data")) {
            const fd = await request.formData();
            const rawInterests = fd.get("interests");
            const rawForm = fd.get("form_data");
            parsed = Body.parse({
              first_name: fd.get("first_name"),
              last_name: fd.get("last_name"),
              email: fd.get("email"),
              phone: fd.get("phone") || undefined,
              address: fd.get("address") || undefined,
              city: fd.get("city") || undefined,
              state: fd.get("state") || undefined,
              postal_code: fd.get("postal_code") || undefined,
              employer: fd.get("employer") || undefined,
              occupation: fd.get("occupation") || undefined,
              qualifications: fd.get("qualifications") || undefined,
              statement: fd.get("statement") || undefined,
              conflicts_disclosure: fd.get("conflicts_disclosure") || undefined,
              interests: typeof rawInterests === "string" ? JSON.parse(rawInterests) : [],
              primary_body_id: fd.get("primary_body_id") || undefined,
              form_data: typeof rawForm === "string" ? JSON.parse(rawForm) : {},
              hp: (fd.get("hp") as string) || "",
            });
            const f = fd.get("cover_letter");
            if (f instanceof File && f.size > 0) {
              if (f.size > 5 * 1024 * 1024) return j({ error: "Cover letter too large (max 5MB)" }, 400);
              coverFile = f;
            }
          } else {
            parsed = Body.parse(await request.json());
          }
          if (parsed.hp) return j({ ok: true }, 200); // silently accept bots

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Verify bodies accept applications
          const bodyIds = Array.from(new Set(parsed.interests.map((i) => i.body_id)));
          const { data: bodies } = await supabaseAdmin
            .from("official_bodies")
            .select("id, accepting_applications")
            .in("id", bodyIds);
          const ok = (bodies ?? []).filter((b: any) => b.accepting_applications).map((b: any) => b.id);
          const validInterests = parsed.interests.filter((i) => ok.includes(i.body_id));
          if (validInterests.length === 0) return j({ error: "No selected boards are accepting applications" }, 400);

          let coverPath: string | null = null;
          if (coverFile) {
            const ext = coverFile.name.split(".").pop()?.toLowerCase() ?? "bin";
            coverPath = `cover-letters/${crypto.randomUUID()}.${ext}`;
            const ab = await coverFile.arrayBuffer();
            const { error: upErr } = await supabaseAdmin.storage
              .from("board-applications")
              .upload(coverPath, new Uint8Array(ab), { contentType: coverFile.type || undefined });
            if (upErr) return j({ error: "Cover letter upload failed" }, 500);
          }

          const { generateToken, getAppBaseUrl } = await import("@/lib/candidate-tokens.server");
          const { token, hash } = generateToken();

          const { data: sub, error: insErr } = await supabaseAdmin
            .from("board_application_submissions")
            .insert({
              first_name: parsed.first_name,
              last_name: parsed.last_name,
              email: parsed.email,
              phone: parsed.phone ?? null,
              address: parsed.address ?? null,
              city: parsed.city ?? null,
              state: parsed.state ?? null,
              postal_code: parsed.postal_code ?? null,
              employer: parsed.employer ?? null,
              occupation: parsed.occupation ?? null,
              qualifications: parsed.qualifications ?? null,
              statement: parsed.statement ?? null,
              conflicts_disclosure: parsed.conflicts_disclosure ?? null,
              cover_letter_path: coverPath,
              form_data: parsed.form_data ?? {},
              status: "submitted",
              // Store only the hash so a database leak cannot be used to look up
              // an applicant's PII via /serve/status/<token>. The applicant keeps
              // the raw token in the status URL returned below.
              status_token: hash,
            } as never)
            .select("id")
            .single();
          if (insErr) return j({ error: insErr.message }, 500);
          const s = sub as { id: string };

          const primaryId = parsed.primary_body_id && ok.includes(parsed.primary_body_id)
            ? parsed.primary_body_id
            : validInterests[0].body_id;
          const rows = validInterests.map((i) => ({
            submission_id: s.id,
            body_id: i.body_id,
            is_primary: i.body_id === primaryId,
          }));
          await supabaseAdmin.from("board_application_interests").insert(rows as never);

          await supabaseAdmin.from("board_application_audit").insert({
            submission_id: s.id,
            action: "submitted",
            details: { boards: validInterests.length },
          } as never);

          // Notify clerks + HR admins
          const { data: staff } = await supabaseAdmin
            .from("user_roles").select("user_id").in("role", ["hr_admin", "city_clerk"]);
          for (const row of (staff ?? []) as Array<{ user_id: string }>) {
            await supabaseAdmin.from("notifications").insert({
              user_id: row.user_id,
              type: "board_application",
              title: "New board application",
              body: `${parsed.first_name} ${parsed.last_name} applied to serve`,
              link: `/admin-officials?tab=applications`,
            } as never);
          }

          const statusUrl = `${getAppBaseUrl(request)}/serve/status/${token}`;
          return j({ id: s.id, status_token: token, status_url: statusUrl }, 200);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Bad request";
          return j({ error: msg }, 400);
        }
      },
    },
  },
});