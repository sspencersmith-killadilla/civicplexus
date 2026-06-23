import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CATEGORIES = ["harassment", "discrimination", "retaliation", "policy", "pay", "safety", "other"] as const;
const STATUSES = ["submitted", "triage", "investigating", "resolved", "closed", "withdrawn"] as const;

export const fileGrievance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      subject_employee_id: z.string().uuid().optional().nullable(),
      category: z.enum(CATEGORIES),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      summary: z.string().trim().min(5).max(300),
      details: z.string().trim().max(20000).optional(),
      is_anonymous: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("grievances")
      .insert({
        submitted_by: context.userId,
        subject_employee_id: data.subject_employee_id ?? null,
        category: data.category,
        severity: data.severity,
        summary: data.summary,
        details: data.details ?? null,
        is_anonymous: data.is_anonymous,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.rpc("record_audit_event" as never, {
      _action: "file", _entity: "grievance", _entity_id: row.id,
      _diff: { category: data.category, severity: data.severity },
    } as never);
    return row;
  });

export const updateGrievanceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      grievance_id: z.string().uuid(),
      status: z.enum(STATUSES),
      resolution_summary: z.string().trim().max(5000).optional(),
      assigned_hr_id: z.string().uuid().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { status: data.status };
    if (data.resolution_summary) patch.resolution_summary = data.resolution_summary;
    if (data.assigned_hr_id !== undefined) patch.assigned_hr_id = data.assigned_hr_id;
    if (data.status === "resolved" || data.status === "closed") patch.resolved_at = new Date().toISOString();
    const { error } = await context.supabase.from("grievances").update(patch as never).eq("id", data.grievance_id);
    if (error) throw new Error(error.message);
    await context.supabase.rpc("record_audit_event" as never, {
      _action: "status_change", _entity: "grievance", _entity_id: data.grievance_id,
      _diff: patch as never,
    } as never);
    return { ok: true };
  });

export const addGrievanceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      grievance_id: z.string().uuid(),
      content: z.string().trim().min(1).max(10000),
      visibility: z.enum(["hr_only", "shared_with_submitter"]).default("hr_only"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("grievance_notes").insert({
      grievance_id: data.grievance_id,
      author_id: context.userId,
      visibility: data.visibility,
      content: data.content,
    });
    if (error) throw new Error(error.message);
    await context.supabase.rpc("record_audit_event" as never, {
      _action: "add_note", _entity: "grievance", _entity_id: data.grievance_id,
      _diff: { visibility: data.visibility },
    } as never);
    return { ok: true };
  });

export const acknowledgeGrievance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    grievance_id: z.string().uuid(),
    due_date: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      acknowledged_at: new Date().toISOString(),
      status: "triage",
    };
    if (data.due_date) patch.due_date = data.due_date;
    const { error } = await context.supabase.from("grievances").update(patch as never).eq("id", data.grievance_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignGrievance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    grievance_id: z.string().uuid(),
    assigned_hr_id: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("grievances")
      .update({ assigned_hr_id: data.assigned_hr_id } as never).eq("id", data.grievance_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("notifications").insert({
      user_id: data.assigned_hr_id, type: "grievance",
      title: "Grievance assigned to you", body: "Open your queue to review.", link: `/grievances/${data.grievance_id}`,
    });
    return { ok: true };
  });

export const addGrievanceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    grievance_id: z.string().uuid(),
    title: z.string().trim().min(2).max(200),
    description: z.string().max(2000).optional(),
    assignee_id: z.string().uuid().optional(),
    due_date: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("grievance_tasks" as never).insert({
      grievance_id: data.grievance_id, title: data.title,
      description: data.description ?? null, assignee_id: data.assignee_id ?? null,
      due_date: data.due_date ?? null, created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const completeGrievanceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ task_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await context.supabase.from("grievance_tasks" as never).update({
      status: "done", completed_at: new Date().toISOString(),
    } as never).eq("id", data.task_id);
    return { ok: true };
  });

export const resolveGrievance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    grievance_id: z.string().uuid(),
    outcome: z.enum(["upheld","partially_upheld","dismissed","withdrawn"]),
    resolution_summary: z.string().trim().min(5).max(10000),
    appeal_deadline: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("grievances").update({
      outcome: data.outcome,
      resolution_summary: data.resolution_summary,
      appeal_deadline: data.appeal_deadline ?? null,
      resolved_at: new Date().toISOString(),
      status: "resolved",
    } as never).eq("id", data.grievance_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });