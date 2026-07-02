import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertRole(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["hr_admin", "city_clerk"]);
  if (!data || data.length === 0) throw new Error("HR admin or City Clerk only");
}

/** All templates (auth read). */
export const listOfficialOnboardingTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: tpls, error }, { data: tasks }] = await Promise.all([
      context.supabase
        .from("official_onboarding_templates")
        .select("*, official_bodies(name, slug)")
        .order("is_default", { ascending: false })
        .order("name"),
      context.supabase
        .from("official_template_tasks")
        .select("*")
        .order("sort_order"),
    ]);
    if (error) throw error;
    return { templates: tpls ?? [], tasks: tasks ?? [] };
  });

/** Onboarding for one term: instance + tasks. */
export const getOfficialOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ term_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: inst } = await context.supabase
      .from("official_onboarding_instances")
      .select("*, official_onboarding_templates(name, description)")
      .eq("term_id", data.term_id)
      .maybeSingle();
    if (!inst) return { instance: null, tasks: [] };
    const { data: tasks } = await context.supabase
      .from("official_task_instances")
      .select("*, documents(id, name, storage_path)")
      .eq("instance_id", inst.id)
      .order("sort_order");
    return { instance: inst, tasks: tasks ?? [] };
  });

/** Update a single task: status, notes, evidence, due date. */
export const updateOfficialTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        task_id: z.string().uuid(),
        status: z.enum(["pending", "in_progress", "complete", "skipped", "blocked", "waived"]).optional(),
        notes: z.string().nullable().optional(),
        due_date: z.string().nullable().optional(),
        evidence_document_id: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.due_date !== undefined) patch.due_date = data.due_date;
    if (data.evidence_document_id !== undefined) patch.evidence_document_id = data.evidence_document_id;
    const { error } = await context.supabase
      .from("official_task_instances")
      .update(patch)
      .eq("id", data.task_id);
    if (error) throw error;
    return { ok: true };
  });

/** Reseed a term's onboarding from a chosen (or auto-picked) template. Clerk only. */
export const reseedOfficialOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ term_id: z.string().uuid(), template_id: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);

    const { data: term } = await context.supabase
      .from("official_terms")
      .select("id, start_date")
      .eq("id", data.term_id)
      .maybeSingle();
    if (!term) throw new Error("Term not found");

    let tplId = data.template_id;
    if (!tplId) {
      const { data: picked } = await context.supabase.rpc("pick_official_onboarding_template", {
        _term_id: data.term_id,
      });
      tplId = picked as string;
    }
    if (!tplId) throw new Error("No template available");

    // Delete any existing instance for this term (cascades tasks)
    await context.supabase
      .from("official_onboarding_instances")
      .delete()
      .eq("term_id", data.term_id);

    const { data: inst, error: iErr } = await context.supabase
      .from("official_onboarding_instances")
      .insert({ term_id: data.term_id, template_id: tplId })
      .select("id")
      .single();
    if (iErr) throw iErr;

    const { data: tpls } = await context.supabase
      .from("official_template_tasks")
      .select("*")
      .eq("template_id", tplId)
      .order("sort_order");

    if (tpls && tpls.length) {
      const rows = tpls.map((tt: any) => ({
        instance_id: inst.id,
        template_task_id: tt.id,
        title: tt.title,
        description: tt.description,
        category: tt.category,
        assignee: tt.assignee,
        is_required: tt.is_required,
        completion_signal: tt.completion_signal,
        sort_order: tt.sort_order,
        due_date: term.start_date
          ? new Date(new Date(term.start_date).getTime() + tt.days_offset * 86400000)
              .toISOString()
              .slice(0, 10)
          : null,
      }));
      const { error: tErr } = await context.supabase.from("official_task_instances").insert(rows);
      if (tErr) throw tErr;
    }

    return { instance_id: inst.id, template_id: tplId };
  });

/** Dashboard: overdue tasks and pending terms across all bodies. */
export const overdueOfficialOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("official_task_instances")
      .select(
        `id, title, category, assignee, due_date, status,
         official_onboarding_instances!inner(
           term_id,
           official_terms!inner(
             id,
             officials(first_name, last_name),
             official_seats!inner(seat_label, official_bodies!inner(name, slug))
           )
         )`,
      )
      .lt("due_date", today)
      .in("status", ["pending", "in_progress", "blocked"])
      .order("due_date");
    if (error) throw error;
    return data ?? [];
  });

/** Save a template task (upsert). Clerk only. */
export const upsertOnboardingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        body_id: z.string().uuid().nullable().optional(),
        appointment_type: z.enum(["elected", "appointed"]).nullable().optional(),
        is_default: z.boolean().optional(),
        is_active: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    if (data.id) {
      const { error } = await context.supabase
        .from("official_onboarding_templates")
        .update({
          name: data.name,
          description: data.description ?? null,
          body_id: data.body_id ?? null,
          appointment_type: data.appointment_type ?? null,
          is_default: data.is_default ?? false,
          is_active: data.is_active ?? true,
        })
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("official_onboarding_templates")
      .insert({
        name: data.name,
        description: data.description ?? null,
        body_id: data.body_id ?? null,
        appointment_type: data.appointment_type ?? null,
        is_default: data.is_default ?? false,
        is_active: data.is_active ?? true,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const upsertOnboardingTemplateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        template_id: z.string().uuid(),
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        category: z.enum([
          "oath", "bond", "ethics", "disclosure", "training", "policy", "provisioning", "orientation", "other",
        ]),
        assignee: z.enum(["official", "clerk", "chair", "hr", "it", "automated"]),
        is_required: z.boolean(),
        days_offset: z.number().int(),
        sort_order: z.number().int(),
        completion_signal: z.enum([
          "none", "oath_signed", "bond_filed", "ethics_ack", "coi_filed", "toma_complete", "pia_complete", "photo_consent",
        ]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const row = {
      template_id: data.template_id,
      title: data.title,
      description: data.description ?? null,
      category: data.category,
      assignee: data.assignee,
      is_required: data.is_required,
      days_offset: data.days_offset,
      sort_order: data.sort_order,
      completion_signal: data.completion_signal,
    };
    if (data.id) {
      const { error } = await context.supabase.from("official_template_tasks").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("official_template_tasks")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { id: created.id };
  });

export const deleteOnboardingTemplateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { error } = await context.supabase.from("official_template_tasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });