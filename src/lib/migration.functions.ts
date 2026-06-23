import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertHr(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data?.length) throw new Error("Forbidden — HR admin only");
}

const STAGES = ["positions", "worker_types", "employees", "managers", "comp", "leave_balances", "certifications", "policy_acks"] as const;
type Stage = (typeof STAGES)[number];

export const stageMigrationRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      import_job_id: z.string().uuid().optional(),
      source_id: z.string().uuid().optional(),
      stage: z.enum(STAGES),
      rows: z.array(z.object({ external_key: z.string().min(1), payload: z.record(z.string(), z.unknown()) })).max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let jobId = data.import_job_id;
    if (!jobId) {
      const { data: job, error } = await supabaseAdmin
        .from("import_jobs")
        .insert({ created_by: context.userId, status: "staging", kind: "hris_migration", total_rows: data.rows.length })
        .select("id").single();
      if (error) throw new Error(error.message);
      jobId = job.id;
    }

    const inserts = data.rows.map((r) => ({
      import_job_id: jobId!,
      source_id: data.source_id ?? null,
      stage: data.stage,
      external_key: r.external_key,
      payload: r.payload as never,
      outcome: "pending" as const,
    }));
    const { error } = await supabaseAdmin.from("migration_stages").upsert(inserts as never, { onConflict: "import_job_id,stage,external_key" });
    if (error) throw new Error(error.message);
    return { import_job_id: jobId!, staged: inserts.length };
  });

function pickText(p: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
function pickDate(p: Record<string, unknown>, ...keys: string[]): string | null {
  const t = pickText(p, ...keys);
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function pickNum(p: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() && !isNaN(Number(v))) return Number(v);
  }
  return null;
}

export const commitMigrationStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ import_job_id: z.string().uuid(), stage: z.enum(STAGES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("migration_stages")
      .select("*")
      .eq("import_job_id", data.import_job_id)
      .eq("stage", data.stage)
      .eq("outcome", "pending");
    if (!rows?.length) return { processed: 0, created: 0, updated: 0, failed: 0 };

    let created = 0, updated = 0, failed = 0;
    for (const r of rows) {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      try {
        if (data.stage === "worker_types") {
          const name = pickText(p, "name", "worker_type") ?? r.external_key;
          const key = (pickText(p, "key") ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
          const { data: existing } = await supabaseAdmin.from("worker_types").select("id").eq("name", name).maybeSingle();
          if (existing) {
            await supabaseAdmin.from("migration_stages").update({ outcome: "updated", target_id: existing.id, outcome_message: "matched by name" }).eq("id", r.id);
            updated++;
          } else {
            const { data: row, error } = await supabaseAdmin.from("worker_types").insert({ name, key, description: pickText(p, "description") }).select("id").single();
            if (error) throw new Error(error.message);
            await supabaseAdmin.from("migration_stages").update({ outcome: "created", target_id: row.id }).eq("id", r.id);
            created++;
          }
        } else if (data.stage === "positions") {
          const title = pickText(p, "title", "position_title", "job_title") ?? r.external_key;
          const dept = pickText(p, "department", "dept");
          const { data: existing } = await supabaseAdmin.from("positions").select("id").eq("title", title).maybeSingle();
          if (existing) {
            await supabaseAdmin.from("migration_stages").update({ outcome: "updated", target_id: existing.id }).eq("id", r.id);
            updated++;
          } else {
            const { data: row, error } = await supabaseAdmin.from("positions").insert({ title, department: dept }).select("id").single();
            if (error) throw new Error(error.message);
            await supabaseAdmin.from("migration_stages").update({ outcome: "created", target_id: row.id }).eq("id", r.id);
            created++;
          }
        } else if (data.stage === "employees") {
          const first = pickText(p, "first_name", "first", "given_name") ?? "";
          const last = pickText(p, "last_name", "last", "surname", "family_name") ?? "";
          const email = pickText(p, "personal_email", "email", "work_email");
          const start = pickDate(p, "start_date", "hire_date");
          const title = pickText(p, "job_title", "title", "position");
          const dept = pickText(p, "department", "dept");
          const { data: existing } = email
            ? await supabaseAdmin.from("employees").select("id").eq("personal_email", email).maybeSingle()
            : { data: null };
          if (existing) {
            await supabaseAdmin.from("employees").update({ first_name: first, last_name: last, job_title: title, department: dept, start_date: start }).eq("id", existing.id);
            await supabaseAdmin.from("migration_stages").update({ outcome: "updated", target_id: existing.id }).eq("id", r.id);
            updated++;
          } else {
            const { data: row, error } = await supabaseAdmin.from("employees").insert({
              first_name: first, last_name: last, personal_email: email,
              job_title: title, department: dept, start_date: start, status: "active",
            }).select("id").single();
            if (error) throw new Error(error.message);
            await supabaseAdmin.from("migration_stages").update({ outcome: "created", target_id: row.id }).eq("id", r.id);
            created++;
          }
        } else if (data.stage === "managers") {
          const empEmail = pickText(p, "personal_email", "email");
          const mgrEmail = pickText(p, "manager_email", "supervisor_email");
          if (!empEmail || !mgrEmail) { failed++; await supabaseAdmin.from("migration_stages").update({ outcome: "failed", outcome_message: "missing email or manager_email" }).eq("id", r.id); continue; }
          const { data: emp } = await supabaseAdmin.from("employees").select("id").eq("personal_email", empEmail).maybeSingle();
          const { data: mgr } = await supabaseAdmin.from("employees").select("id").eq("personal_email", mgrEmail).maybeSingle();
          if (!emp || !mgr) { failed++; await supabaseAdmin.from("migration_stages").update({ outcome: "failed", outcome_message: "employee or manager not found" }).eq("id", r.id); continue; }
          await supabaseAdmin.from("employees").update({ manager_id: mgr.id }).eq("id", emp.id);
          await supabaseAdmin.from("migration_stages").update({ outcome: "updated", target_id: emp.id }).eq("id", r.id);
          updated++;
        } else if (data.stage === "comp") {
          const email = pickText(p, "personal_email", "email");
          const base = pickNum(p, "base_annual", "salary", "annual_salary");
          const hourly = pickNum(p, "hourly_rate", "rate");
          const eff = pickDate(p, "effective_date", "start_date") ?? new Date().toISOString().slice(0, 10);
          if (!email) { failed++; await supabaseAdmin.from("migration_stages").update({ outcome: "failed", outcome_message: "missing email" }).eq("id", r.id); continue; }
          const { data: emp } = await supabaseAdmin.from("employees").select("id").eq("personal_email", email).maybeSingle();
          if (!emp) { failed++; await supabaseAdmin.from("migration_stages").update({ outcome: "failed", outcome_message: "employee not found" }).eq("id", r.id); continue; }
          const { error } = await supabaseAdmin.from("employee_comp").insert({
            employee_id: emp.id, effective_date: eff, base_annual: base, hourly_rate: hourly, source: "hire", change_reason: "migration backfill",
          });
          if (error) throw new Error(error.message);
          await supabaseAdmin.from("migration_stages").update({ outcome: "created", target_id: emp.id }).eq("id", r.id);
          created++;
        } else {
          await supabaseAdmin.from("migration_stages").update({ outcome: "skipped", outcome_message: "stage not yet implemented" }).eq("id", r.id);
        }
      } catch (e) {
        failed++;
        await supabaseAdmin.from("migration_stages").update({ outcome: "failed", outcome_message: (e as Error).message }).eq("id", r.id);
      }
    }

    return { processed: rows.length, created, updated, failed };
  });

export const reconciliationReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ import_job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("migration_stages")
      .select("stage, outcome, external_key, outcome_message")
      .eq("import_job_id", data.import_job_id)
      .order("stage", { ascending: true });
    return { rows: rows ?? [] };
  });