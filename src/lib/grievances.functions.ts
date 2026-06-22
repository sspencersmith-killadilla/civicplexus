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
    await context.supabase.from("audit_events").insert({
      actor_id: context.userId,
      action: "file",
      entity: "grievance",
      entity_id: row.id,
      diff: { category: data.category, severity: data.severity },
    });
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
    await context.supabase.from("audit_events").insert({
      actor_id: context.userId,
      action: "status_change",
      entity: "grievance",
      entity_id: data.grievance_id,
      diff: patch as never,
    });
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
    await context.supabase.from("audit_events").insert({
      actor_id: context.userId,
      action: "add_note",
      entity: "grievance",
      entity_id: data.grievance_id,
      diff: { visibility: data.visibility },
    });
    return { ok: true };
  });