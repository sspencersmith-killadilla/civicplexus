import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const OfferDraft = z.object({
  application_id: z.string().uuid(),
  worker_type_id: z.string().uuid(),
  salary: z.number().nonnegative().optional().nullable(),
  pay_grade: z.string().max(40).optional().nullable(),
  start_date: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  letter_html: z.string().max(40000).optional().nullable(),
});

async function buildLetter(orgName: string, vars: { first_name: string; job_title: string; salary?: number | null; start_date?: string | null; expires_at?: string | null }) {
  return `<h1>Offer of Employment</h1>
<p>Dear ${vars.first_name},</p>
<p>${orgName} is pleased to offer you the position of <strong>${vars.job_title}</strong>.</p>
<ul>
  <li><strong>Start date:</strong> ${vars.start_date ?? "TBD"}</li>
  <li><strong>Annualized salary:</strong> ${vars.salary != null ? `$${Number(vars.salary).toLocaleString()}` : "TBD"}</li>
  <li><strong>Offer expires:</strong> ${vars.expires_at ? new Date(vars.expires_at).toLocaleString() : "—"}</li>
</ul>
<p>Employment is at-will and subject to standard pre-employment checks. By accepting, you confirm the terms above.</p>
<p>We look forward to welcoming you to the team.</p>`;
}

export const createOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OfferDraft.parse(i))
  .handler(async ({ data, context }) => {
    const { data: app } = await context.supabase.from("job_applications" as never)
      .select("id, applicant_name, requisition_id, job_requisitions:requisition_id(title)")
      .eq("id", data.application_id).single();
    if (!app) throw new Error("Application not found");
    const a = app as unknown as { id: string; applicant_name: string; requisition_id: string; job_requisitions: { title: string } | null };
    const { data: org } = await context.supabase.from("org_settings").select("org_name").limit(1).maybeSingle();
    const orgName = (org as { org_name: string | null } | null)?.org_name ?? "Our Organization";
    const [firstName] = a.applicant_name.split(" ");
    const letter = data.letter_html ?? await buildLetter(orgName, {
      first_name: firstName, job_title: a.job_requisitions?.title ?? "—",
      salary: data.salary, start_date: data.start_date, expires_at: data.expires_at,
    });
    const { data: row, error } = await context.supabase.from("offers" as never).insert({
      application_id: data.application_id,
      requisition_id: a.requisition_id,
      worker_type_id: data.worker_type_id,
      salary: data.salary ?? null,
      pay_grade: data.pay_grade ?? null,
      start_date: data.start_date ?? null,
      expires_at: data.expires_at ?? null,
      letter_html: letter,
      status: "draft",
      created_by: context.userId,
    } as never).select().single();
    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const updateOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), patch: OfferDraft.partial() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("offers" as never).update(data.patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Releases an offer: mints a tokenized link, marks sent, emails the candidate. */
export const sendOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ offer_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { generateToken, getAppBaseUrl } = await import("./candidate-tokens.server");
    const { data: offer } = await context.supabase.from("offers" as never)
      .select("id, application_id, expires_at, status, job_applications:application_id(email, applicant_name, requisition_id, job_requisitions:requisition_id(title))")
      .eq("id", data.offer_id).single();
    if (!offer) throw new Error("Offer not found");
    const o = offer as unknown as { id: string; application_id: string; expires_at: string | null; status: string; job_applications: { email: string; applicant_name: string; job_requisitions: { title: string } | null } | null };
    if (o.status !== "draft" && o.status !== "sent") throw new Error("Offer cannot be sent in current state");

    const { token, hash } = generateToken();
    const expires = o.expires_at ?? new Date(Date.now() + 14 * 86400000).toISOString();
    await context.supabase.from("candidate_tokens" as never).insert({
      application_id: o.application_id, token_hash: hash, purpose: "offer", expires_at: expires,
    } as never);
    await context.supabase.from("offers" as never).update({ status: "sent", sent_at: new Date().toISOString(), expires_at: expires } as never).eq("id", o.id);

    const base = getAppBaseUrl();
    const offerUrl = `${base}/offer/${token}`;

    const { sendTemplatedToApplicant } = await import("./email-templates.functions");
    try {
      await sendTemplatedToApplicant({ data: {
        application_id: o.application_id,
        template_key: "offer_extended",
        extra_vars: { offer_url: offerUrl, offer_expires: new Date(expires).toLocaleDateString() },
      } });
    } catch { /* logged via event */ }

    return { offer_url: offerUrl, token };
  });

export const voidOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ offer_id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await context.supabase.from("offers" as never).update({ status: "void", decline_reason: data.reason ?? null } as never).eq("id", data.offer_id);
    return { ok: true };
  });

/** Reads offer stats for reports. */
export const offerStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("offers" as never).select("status, decline_reason");
    const rows = (data ?? []) as Array<{ status: string; decline_reason: string | null }>;
    const total = rows.length;
    const accepted = rows.filter(r => r.status === "accepted").length;
    const declined = rows.filter(r => r.status === "declined").length;
    const declineReasons: Record<string, number> = {};
    rows.filter(r => r.status === "declined" && r.decline_reason).forEach(r => {
      const k = (r.decline_reason ?? "Unspecified").slice(0, 60);
      declineReasons[k] = (declineReasons[k] ?? 0) + 1;
    });
    return { total, accepted, declined, acceptance_rate: total ? accepted / total : 0, decline_reasons: declineReasons };
  });