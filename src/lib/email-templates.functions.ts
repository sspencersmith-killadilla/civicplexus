import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sendApplicantEmail } from "./applicant-emails.functions";

const TemplatePatch = z.object({
  template_key: z.string().min(2).max(60),
  name: z.string().min(2).max(120),
  subject: z.string().min(2).max(300),
  body: z.string().min(2).max(20000),
  description: z.string().max(500).optional().nullable(),
  active: z.boolean().default(true),
});

export const listEmailTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("email_templates" as never).select("*").order("template_key");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; template_key: string; name: string; subject: string; body: string; description: string | null; active: boolean; updated_at: string }>;
  });

export const upsertEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TemplatePatch.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_templates" as never)
      .upsert({ ...data, updated_by: context.userId } as never, { onConflict: "template_key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function render(s: string, vars: Record<string, string | null | undefined>) {
  return s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => (vars[k] ?? "").toString());
}

/** Resolve common variables for an application + send a template. Best-effort. */
export const sendTemplatedToApplicant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    application_id: z.string().uuid(),
    template_key: z.string().min(2),
    extra_vars: z.record(z.string(), z.string()).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: tpl } = await context.supabase
      .from("email_templates" as never).select("*").eq("template_key", data.template_key).eq("active", true).maybeSingle();
    if (!tpl) throw new Error(`Template ${data.template_key} not found or inactive`);
    const t = tpl as { subject: string; body: string };

    const { data: app } = await context.supabase
      .from("job_applications" as never)
      .select("id, applicant_name, email, requisition_id, job_requisitions:requisition_id(title)")
      .eq("id", data.application_id).single();
    if (!app) throw new Error("Application not found");
    const a = app as unknown as { id: string; applicant_name: string; email: string; job_requisitions: { title: string } | null };

    const { data: org } = await context.supabase.from("org_settings").select("org_name").limit(1).maybeSingle();
    const orgName = (org as { org_name: string | null } | null)?.org_name ?? "Our team";

    const [firstName] = a.applicant_name.split(" ");
    const vars = {
      first_name: firstName,
      full_name: a.applicant_name,
      job_title: a.job_requisitions?.title ?? "the role",
      org_name: orgName,
      portal_url: "",
      offer_url: "",
      onboarding_url: "",
      ...(data.extra_vars ?? {}),
    };
    const subject = render(t.subject, vars);
    const body = render(t.body, vars);
    const ok = await sendApplicantEmail({ to: a.email, subject, body });
    await context.supabase.from("job_application_events" as never).insert({
      application_id: a.id, actor_id: context.userId, event_type: "email_sent",
      payload: { template_key: data.template_key, subject, ok },
    } as never);
    return { ok };
  });