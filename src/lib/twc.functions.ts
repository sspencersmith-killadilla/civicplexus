import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertHr(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data?.length) throw new Error("Forbidden — HR admin only");
}

export const listNewHireReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHr(context.userId);
    const { data: reports } = await context.supabase
      .from("new_hire_reports")
      .select("id,employee_id,hire_date,status,queued_at,submitted_at,batch_id,employees(first_name,last_name,department,job_title)")
      .order("queued_at", { ascending: false })
      .limit(500);
    const { data: batches } = await context.supabase
      .from("new_hire_batches")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(50);
    return { reports: reports ?? [], batches: batches ?? [] };
  });

function csvField(s: string | null | undefined) {
  const v = (s ?? "").toString().replaceAll('"', '""');
  return /[",\n]/.test(v) ? `"${v}"` : v;
}

export const generateNewHireBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending, error } = await supabaseAdmin
      .from("new_hire_reports")
      .select("id,employee_id,hire_date,employees(first_name,last_name,personal_email)")
      .eq("status", "queued")
      .limit(500);
    if (error) throw new Error(error.message);
    if (!pending?.length) throw new Error("No queued new-hire reports to batch.");

    const { data: org } = await supabaseAdmin.from("org_settings").select("org_name,fed_employer_id,address").eq("singleton", true).maybeSingle();
    const fein = org?.fed_employer_id ?? "";
    const orgName = org?.org_name ?? "";

    const today = new Date().toISOString().slice(0, 10);
    const periodStart = pending.reduce((m, r) => (r.hire_date < m ? r.hire_date : m), today);

    const header = ["FEIN","Employer Name","Employer Address","Employee First","Employee Last","Hire Date","Email"].join(",");
    const lines = pending.map((r) => {
      const e = r.employees as { first_name?: string; last_name?: string; personal_email?: string } | null;
      return [fein, orgName, org?.address ?? "", e?.first_name ?? "", e?.last_name ?? "", r.hire_date, e?.personal_email ?? ""]
        .map(csvField).join(",");
    });
    const file = [header, ...lines].join("\n");

    const { data: batch, error: be } = await supabaseAdmin.from("new_hire_batches").insert({
      period_start: periodStart,
      period_end: today,
      employee_count: pending.length,
      generated_by: context.userId,
    }).select().single();
    if (be) throw new Error(be.message);

    const path = `${batch.id}/twc-new-hires-${today}.csv`;
    const { error: ue } = await supabaseAdmin.storage.from("compliance-exports").upload(path, new Blob([file], { type: "text/csv" }), { upsert: true });
    if (ue) throw new Error(ue.message);

    await supabaseAdmin.from("new_hire_batches").update({ file_path: path }).eq("id", batch.id);
    await supabaseAdmin.from("new_hire_reports")
      .update({ status: "batched", batch_id: batch.id })
      .in("id", pending.map((r) => r.id));

    return { batch_id: batch.id, count: pending.length, path };
  });

export const downloadComplianceFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from("compliance-exports").createSignedUrl(data.path, 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const markBatchSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ batch_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin.from("new_hire_batches").update({ submitted_at: now }).eq("id", data.batch_id);
    await supabaseAdmin.from("new_hire_reports").update({ status: "submitted", submitted_at: now }).eq("batch_id", data.batch_id);
    return { ok: true };
  });