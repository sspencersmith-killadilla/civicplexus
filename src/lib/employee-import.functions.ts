import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ImportError = { row: number; column?: string; message: string };
type ImportResult = { inserted: number; updated: number; skipped: number; errors: ImportError[] };

async function assertHrAdmin(ctx: { supabase: ReturnType<typeof Object>; userId: string }) {
  // Use the user-bound supabase client to check role via has_role RPC equivalent via user_roles read
  const sb = ctx.supabase as never as { from: (t: string) => { select: (c: string) => { eq: (col: string, v: string) => { eq: (col: string, v: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }> } } } };
  const { data, error } = await sb.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "hr_admin");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: HR admin only");
}

const rowsInput = <T extends z.ZodTypeAny>(row: T) =>
  z.object({ rows: z.array(row).min(1).max(5000), job_id: z.string().uuid().optional() });

type JobUpdater = ((partial: Record<string, unknown>) => Promise<void>) | null;

async function makeJobUpdater(jobId: string | undefined, totalRows: number): Promise<JobUpdater> {
  if (!jobId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("import_jobs")
    .update({ status: "processing", started_at: new Date().toISOString(), total_rows: totalRows } as never)
    .eq("id", jobId);
  let last = 0;
  return async (partial) => {
    const now = Date.now();
    if (now - last < 400 && (partial.processed_rows as number | undefined) !== totalRows) return;
    last = now;
    await supabaseAdmin.from("import_jobs").update(partial as never).eq("id", jobId);
  };
}

async function finalizeJob(jobId: string | undefined, result: ImportResult, threw?: unknown) {
  if (!jobId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("import_jobs").update({
    status: threw ? "failed" : "completed",
    finished_at: new Date().toISOString(),
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors as never,
    processed_rows: result.inserted + result.updated + result.skipped,
    error_message: threw ? (threw instanceof Error ? threw.message : String(threw)) : null,
  } as never).eq("id", jobId);
}

async function tick(update: JobUpdater, result: ImportResult) {
  if (!update) return;
  await update({
    processed_rows: result.inserted + result.updated + result.skipped,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors as never,
  });
}

const empRow = z.object({
  external_id: z.string().trim().max(80).optional().or(z.literal("")),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  personal_email: z.string().trim().email().max(255),
  work_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  job_title: z.string().trim().max(120).optional().or(z.literal("")),
  worker_type: z.string().trim().max(120).optional().or(z.literal("")),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  status: z.enum(["candidate", "preboarding", "active", "offboarded"]).optional().or(z.literal("")),
  position_code: z.string().trim().max(80).optional().or(z.literal("")),
  manager_external_id: z.string().trim().max(80).optional().or(z.literal("")),
});

export const importEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rowsInput(empRow).parse(input))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const update = await makeJobUpdater(data.job_id, data.rows.length);
    try {
    const { data: wts } = await supabaseAdmin.from("worker_types").select("id,name");
    const wtMap = new Map((wts ?? []).map((w) => [w.name.toLowerCase(), w.id]));
    const { data: poses } = await supabaseAdmin.from("positions").select("id,position_code");
    const posMap = new Map((poses ?? []).filter((p) => p.position_code).map((p) => [p.position_code!.toLowerCase(), p.id]));

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const rowNum = i + 2;
      try {
        let worker_type_id: string | null = null;
        if (r.worker_type) {
          const id = wtMap.get(r.worker_type.toLowerCase());
          if (!id) { result.errors.push({ row: rowNum, column: "worker_type", message: `Unknown worker type: ${r.worker_type}` }); result.skipped++; continue; }
          worker_type_id = id;
        }
        let position_id: string | null = null;
        if (r.position_code) {
          const id = posMap.get(r.position_code.toLowerCase());
          if (!id) { result.errors.push({ row: rowNum, column: "position_code", message: `Unknown position: ${r.position_code}` }); result.skipped++; continue; }
          position_id = id;
        }
        const patch: Record<string, unknown> = {
          first_name: r.first_name, last_name: r.last_name, personal_email: r.personal_email,
        };
        if (r.external_id) patch.external_id = r.external_id;
        if (r.work_email) patch.work_email = r.work_email;
        if (r.phone) patch.phone = r.phone;
        if (r.department) patch.department = r.department;
        if (r.job_title) patch.job_title = r.job_title;
        if (worker_type_id) patch.worker_type_id = worker_type_id;
        if (position_id) patch.position_id = position_id;
        if (r.start_date) patch.start_date = r.start_date;
        if (r.status) patch.status = r.status;

        let existing: { id: string } | null = null;
        if (r.external_id) {
          const { data } = await supabaseAdmin.from("employees").select("id").eq("external_id", r.external_id).maybeSingle();
          existing = data;
        }
        if (!existing) {
          const { data } = await supabaseAdmin.from("employees").select("id").eq("personal_email", r.personal_email).maybeSingle();
          existing = data;
        }
        if (existing) {
          const { error } = await supabaseAdmin.from("employees").update(patch as never).eq("id", existing.id);
          if (error) throw new Error(error.message);
          result.updated++;
        } else {
          const { error } = await supabaseAdmin.from("employees").insert({ ...patch, status: r.status || "candidate" } as never);
          if (error) throw new Error(error.message);
          result.inserted++;
        }
      } catch (e) {
        result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) });
        result.skipped++;
      }
      await tick(update, result);
    }

    // Second pass: resolve manager_external_id links
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      if (!r.manager_external_id || !r.external_id) continue;
      const rowNum = i + 2;
      try {
        const { data: mgr } = await supabaseAdmin.from("employees").select("id, user_id").eq("external_id", r.manager_external_id).maybeSingle();
        if (!mgr) { result.errors.push({ row: rowNum, column: "manager_external_id", message: `Unknown manager external_id: ${r.manager_external_id}` }); continue; }
        if (mgr.user_id) {
          await supabaseAdmin.from("employees").update({ manager_id: mgr.user_id } as never).eq("external_id", r.external_id);
        }
      } catch (e) {
        result.errors.push({ row: rowNum, column: "manager_external_id", message: e instanceof Error ? e.message : String(e) });
      }
    }

      await finalizeJob(data.job_id, result);
      return result;
    } catch (e) {
      await finalizeJob(data.job_id, result, e);
      throw e;
    }
  });

// ============ Positions import =============
const posRow = z.object({
  position_code: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  flsa_class: z.enum(["exempt", "non_exempt"]).optional().or(z.literal("")),
  pay_grade: z.string().trim().max(40).optional().or(z.literal("")),
  pay_step: z.string().trim().max(40).optional().or(z.literal("")),
  budgeted_fte: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  reports_to_position_code: z.string().trim().max(80).optional().or(z.literal("")),
  status: z.enum(["open", "filled", "frozen", "closed"]).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const importPositions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rowsInput(posRow).parse(input))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const update = await makeJobUpdater(data.job_id, data.rows.length);
    try {

    // Pass 1: upsert positions (without reports_to)
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const rowNum = i + 2;
      try {
        const patch: Record<string, unknown> = { position_code: r.position_code, title: r.title };
        if (r.department) patch.department = r.department;
        if (r.flsa_class) patch.flsa_class = r.flsa_class;
        if (r.pay_grade) patch.pay_grade = r.pay_grade;
        if (r.pay_step) patch.pay_step = r.pay_step;
        if (typeof r.budgeted_fte === "number") patch.budgeted_fte = r.budgeted_fte;
        if (r.status) patch.status = r.status;
        if (r.notes) patch.notes = r.notes;

        const { data: existing } = await supabaseAdmin.from("positions").select("id").eq("position_code", r.position_code).maybeSingle();
        if (existing) {
          const { error } = await supabaseAdmin.from("positions").update(patch as never).eq("id", existing.id);
          if (error) throw new Error(error.message);
          result.updated++;
        } else {
          const { error } = await supabaseAdmin.from("positions").insert(patch as never);
          if (error) throw new Error(error.message);
          result.inserted++;
        }
      } catch (e) {
        result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) });
        result.skipped++;
      }
      await tick(update, result);
    }

    // Pass 2: resolve reports_to_position_code
    const { data: allPos } = await supabaseAdmin.from("positions").select("id, position_code");
    const codeToId = new Map((allPos ?? []).filter((p) => p.position_code).map((p) => [p.position_code!.toLowerCase(), p.id]));
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      if (!r.reports_to_position_code) continue;
      const rowNum = i + 2;
      const parentId = codeToId.get(r.reports_to_position_code.toLowerCase());
      if (!parentId) { result.errors.push({ row: rowNum, column: "reports_to_position_code", message: `Unknown parent position: ${r.reports_to_position_code}` }); continue; }
      await supabaseAdmin.from("positions").update({ reports_to_position_id: parentId } as never).eq("position_code", r.position_code);
    }

      await finalizeJob(data.job_id, result);
      return result;
    } catch (e) {
      await finalizeJob(data.job_id, result, e);
      throw e;
    }
  });

async function resolveEmployeeId(sb: typeof import("@/integrations/supabase/client.server")["supabaseAdmin"], email: string) {
  const { data } = await sb.from("employees").select("id").eq("personal_email", email).maybeSingle();
  return data?.id ?? null;
}

const depRow = z.object({
  employee_email: z.string().trim().email().max(255),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  relationship: z.string().trim().min(1).max(40),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  ssn_last4: z.string().regex(/^\d{4}$/).optional().or(z.literal("")),
});

export const importDependents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rowsInput(depRow).parse(input))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i]; const rowNum = i + 2;
      try {
        const employee_id = await resolveEmployeeId(supabaseAdmin, r.employee_email);
        if (!employee_id) { result.errors.push({ row: rowNum, column: "employee_email", message: `No employee with email ${r.employee_email}` }); result.skipped++; continue; }
        const patch: Record<string, unknown> = { employee_id, first_name: r.first_name, last_name: r.last_name, relationship: r.relationship };
        if (r.dob) patch.dob = r.dob;
        if (r.ssn_last4) patch.ssn_last4 = r.ssn_last4;
        const { data: existing } = await supabaseAdmin.from("dependents").select("id").eq("employee_id", employee_id).eq("first_name", r.first_name).eq("last_name", r.last_name).maybeSingle();
        if (existing) {
          const { error } = await supabaseAdmin.from("dependents").update(patch as never).eq("id", existing.id);
          if (error) throw new Error(error.message);
          result.updated++;
        } else {
          const { error } = await supabaseAdmin.from("dependents").insert(patch as never);
          if (error) throw new Error(error.message);
          result.inserted++;
        }
      } catch (e) {
        result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) }); result.skipped++;
      }
    }
    return result;
  });

const certRow = z.object({
  employee_email: z.string().trim().email().max(255),
  certification_name: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).optional().or(z.literal("")),
  issued_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const importCertifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rowsInput(certRow).parse(input))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const { data: certs } = await supabaseAdmin.from("certifications").select("id,name");
    const certMap = new Map((certs ?? []).map((c) => [c.name.toLowerCase(), c.id]));
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i]; const rowNum = i + 2;
      try {
        const employee_id = await resolveEmployeeId(supabaseAdmin, r.employee_email);
        if (!employee_id) { result.errors.push({ row: rowNum, column: "employee_email", message: `No employee with email ${r.employee_email}` }); result.skipped++; continue; }
        const certification_id = certMap.get(r.certification_name.toLowerCase());
        if (!certification_id) { result.errors.push({ row: rowNum, column: "certification_name", message: `Unknown certification: ${r.certification_name}` }); result.skipped++; continue; }
        const patch: Record<string, unknown> = { employee_id, certification_id };
        if (r.issued_at) patch.issued_at = r.issued_at;
        if (r.expires_at) patch.expires_at = r.expires_at;
        if (r.notes) patch.notes = r.notes;
        const { data: existing } = await supabaseAdmin.from("employee_certifications").select("id").eq("employee_id", employee_id).eq("certification_id", certification_id).maybeSingle();
        if (existing) {
          const { error } = await supabaseAdmin.from("employee_certifications").update(patch as never).eq("id", existing.id);
          if (error) throw new Error(error.message); result.updated++;
        } else {
          const { error } = await supabaseAdmin.from("employee_certifications").insert(patch as never);
          if (error) throw new Error(error.message); result.inserted++;
        }
      } catch (e) { result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) }); result.skipped++; }
    }
    return result;
  });

const trainingRow = z.object({
  employee_email: z.string().trim().email().max(255),
  course_name: z.string().trim().min(1).max(200),
  status: z.enum(["assigned", "in_progress", "complete", "overdue"]).optional().or(z.literal("")),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  completed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  score: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
});

export const importTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rowsInput(trainingRow).parse(input))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const { data: cs } = await supabaseAdmin.from("courses").select("id,name");
    const courseMap = new Map((cs ?? []).map((c) => [c.name.toLowerCase(), c.id]));
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i]; const rowNum = i + 2;
      try {
        const employee_id = await resolveEmployeeId(supabaseAdmin, r.employee_email);
        if (!employee_id) { result.errors.push({ row: rowNum, column: "employee_email", message: `No employee with email ${r.employee_email}` }); result.skipped++; continue; }
        const course_id = courseMap.get(r.course_name.toLowerCase());
        if (!course_id) { result.errors.push({ row: rowNum, column: "course_name", message: `Unknown course: ${r.course_name}` }); result.skipped++; continue; }
        const patch: Record<string, unknown> = { employee_id, course_id };
        if (r.status) patch.status = r.status;
        if (r.due_date) patch.due_date = r.due_date;
        if (r.completed_at) patch.completed_at = r.completed_at;
        if (typeof r.score === "number") patch.score = r.score;
        const { data: existing } = await supabaseAdmin.from("employee_training").select("id").eq("employee_id", employee_id).eq("course_id", course_id).maybeSingle();
        if (existing) {
          const { error } = await supabaseAdmin.from("employee_training").update(patch as never).eq("id", existing.id);
          if (error) throw new Error(error.message); result.updated++;
        } else {
          const { error } = await supabaseAdmin.from("employee_training").insert(patch as never);
          if (error) throw new Error(error.message); result.inserted++;
        }
      } catch (e) { result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) }); result.skipped++; }
    }
    return result;
  });

const equipRow = z.object({
  employee_email: z.string().trim().email().max(255),
  item_name: z.string().trim().min(1).max(200),
  size: z.string().trim().max(40).optional().or(z.literal("")),
  status: z.string().trim().max(40).optional().or(z.literal("")),
  issued_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  condition: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const importEquipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rowsInput(equipRow).parse(input))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const { data: catalog } = await supabaseAdmin.from("equipment_catalog").select("id,name");
    const catMap = new Map((catalog ?? []).map((c) => [c.name.toLowerCase(), c.id]));
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i]; const rowNum = i + 2;
      try {
        const employee_id = await resolveEmployeeId(supabaseAdmin, r.employee_email);
        if (!employee_id) { result.errors.push({ row: rowNum, column: "employee_email", message: `No employee with email ${r.employee_email}` }); result.skipped++; continue; }
        const equipment_id = catMap.get(r.item_name.toLowerCase());
        if (!equipment_id) { result.errors.push({ row: rowNum, column: "item_name", message: `Unknown item: ${r.item_name}` }); result.skipped++; continue; }
        const patch: Record<string, unknown> = { employee_id, item_id: equipment_id };
        if (r.size) patch.size = r.size;
        if (r.status) patch.status = r.status;
        if (r.issued_at) patch.issued_at = r.issued_at;
        if (r.condition) patch.condition = r.condition;
        if (r.notes) patch.notes = r.notes;
        const { data: existing } = await supabaseAdmin.from("equipment_issuance").select("id").eq("employee_id", employee_id).eq("item_id", equipment_id).maybeSingle();
        if (existing) {
          const { error } = await supabaseAdmin.from("equipment_issuance").update(patch as never).eq("id", existing.id);
          if (error) throw new Error(error.message); result.updated++;
        } else {
          const { error } = await supabaseAdmin.from("equipment_issuance").insert(patch as never);
          if (error) throw new Error(error.message); result.inserted++;
        }
      } catch (e) { result.errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) }); result.skipped++; }
    }
    return result;
  });