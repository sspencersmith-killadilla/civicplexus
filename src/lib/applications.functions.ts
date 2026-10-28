import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type App = {
  id: string;
  requisition_id: string;
  applicant_name: string;
  email: string;
  status: string;
  is_internal: boolean;
  rating: number | null;
  created_at: string;
};

async function authorize(context: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  const { supabase, userId } = context;
  const [{ data: roles }, { data: perms }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.rpc("get_effective_permissions", { _uid: userId }),
  ]);
  const roleSet = new Set(((roles ?? []) as Array<{ role: string }>).map((r) => r.role));
  const permSet = new Set(((perms ?? []) as Array<{ permission_key: string }>).map((p) => p.permission_key));
  return {
    isHr: roleSet.has("hr_admin"),
    canReadAll: roleSet.has("hr_admin") || permSet.has("applications.read"),
  };
}

export const listApplicationsForRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requisition_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { maskApplicant } = await import("@/lib/applicant-alias");
    const { canReadAll, isHr } = await authorize(context);

    if (!canReadAll) {
      // Must be hiring manager / requester on this requisition
      const { data: req } = await supabaseAdmin
        .from("job_requisitions")
        .select("hiring_manager_id, requested_by")
        .eq("id", data.requisition_id).maybeSingle();
      const r = req as { hiring_manager_id: string | null; requested_by: string | null } | null;
      if (!r || (r.hiring_manager_id !== context.userId && r.requested_by !== context.userId)) {
        throw new Error("Not authorized to view applications for this requisition");
      }
    }

    const { data: reqRow } = await supabaseAdmin
      .from("job_requisitions").select("blind_review").eq("id", data.requisition_id).maybeSingle();
    const blindReview = (reqRow as { blind_review: boolean } | null)?.blind_review ?? true;

    const { data: apps, error } = await supabaseAdmin
      .from("job_applications")
      .select("id, requisition_id, applicant_name, email, status, is_internal, rating, created_at, alias_color, alias_animal")
      .eq("requisition_id", data.requisition_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((apps ?? []) as Array<App & { alias_color: string | null; alias_animal: string | null }>)
      .map((a) => ({ ...maskApplicant(a, { blindReview }), can_reveal: isHr }));
  });
/** HR only — reveal a blind-review applicant's identity. Every use is logged. */
export const revealApplicantIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ application_id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { isHr } = await authorize(context);
    if (!isHr) throw new Error("Only HR admins can reveal applicant identity");
    const { error: logErr } = await context.supabase.from("identity_reveal_log").insert({
      subject_kind: "job_application", subject_id: data.application_id, actor_id: context.userId, reason: data.reason ?? null,
    });
    if (logErr) throw new Error(logErr.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app, error } = await supabaseAdmin
      .from("job_applications").select("applicant_name, email, phone").eq("id", data.application_id).maybeSingle();
    if (error || !app) throw new Error(error?.message ?? "Not found");
    return app as { applicant_name: string; email: string; phone: string | null };
  });

/** Parsed resume text, redacted while the applicant is in blind review. */
export const getParsedResumeForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ application_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { maskApplicant, redactText } = await import("@/lib/applicant-alias");
    const { canReadAll } = await authorize(context);
    const { data: app } = await supabaseAdmin
      .from("job_applications")
      .select("applicant_name, email, phone, status, alias_color, alias_animal, job_requisitions:requisition_id(blind_review, hiring_manager_id, requested_by)")
      .eq("id", data.application_id).maybeSingle();
    const a = app as unknown as { applicant_name: string; email: string; phone: string | null; status: string; alias_color: string | null; alias_animal: string | null; job_requisitions: { blind_review: boolean; hiring_manager_id: string | null; requested_by: string | null } | null } | null;
    if (!a) throw new Error("Not found");
    const r = a.job_requisitions;
    if (!canReadAll && r?.hiring_manager_id !== context.userId && r?.requested_by !== context.userId) throw new Error("Not authorized");
    const { data: parse } = await supabaseAdmin
      .from("application_ai_parse").select("parsed, model, created_at").eq("application_id", data.application_id).maybeSingle();
    const p = parse as { parsed: { resume_text?: string; pages?: number; truncated?: boolean }; model: string | null; created_at: string } | null;
    if (!p) return null;
    const masked = maskApplicant(a, { blindReview: r?.blind_review ?? true }).masked;
    if (!masked) return { ...p, redacted: false };
    return { ...p, redacted: true, parsed: { ...p.parsed, resume_text: redactText(p.parsed?.resume_text, [a.applicant_name, a.email.split("@")[0]]) } };
  });
