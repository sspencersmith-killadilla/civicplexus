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
      .select("*, documents(id, title, storage_path, mime_type)")
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
    const patch: {
      status?: typeof data.status;
      notes?: string | null;
      due_date?: string | null;
      evidence_document_id?: string | null;
    } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.due_date !== undefined) patch.due_date = data.due_date;
    if (data.evidence_document_id !== undefined) patch.evidence_document_id = data.evidence_document_id;
    const { error } = await context.supabase
      .from("official_task_instances")
      .update(patch as never)
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

/** Attach an uploaded file to an onboarding task. Creates a documents row + links via evidence_document_id. */
export const attachOfficialTaskDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        task_id: z.string().uuid(),
        storage_path: z.string().min(1),
        title: z.string().min(1),
        mime_type: z.string().nullable().optional(),
        size_bytes: z.number().int().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { data: task, error: te } = await context.supabase
      .from("official_task_instances")
      .select("id, category, official_onboarding_instances!inner(term_id)")
      .eq("id", data.task_id)
      .maybeSingle();
    if (te) throw te;
    if (!task) throw new Error("Task not found");
    const termId = (task as any).official_onboarding_instances.term_id as string;

    const { data: doc, error: de } = await context.supabase
      .from("documents")
      .insert({
        official_term_id: termId,
        kind: (task as any).category ?? "other",
        title: data.title,
        storage_path: data.storage_path,
        mime_type: data.mime_type ?? null,
        size_bytes: data.size_bytes ?? null,
        uploaded_by: context.userId,
        is_sensitive: true,
      })
      .select("id")
      .single();
    if (de) throw de;

    const { error: ue } = await context.supabase
      .from("official_task_instances")
      .update({ evidence_document_id: doc.id })
      .eq("id", data.task_id);
    if (ue) throw ue;

    return { document_id: doc.id };
  });

/** Signed URL for viewing a document attached to an onboarding task. */
export const signOfficialDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ document_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("storage_path, official_term_id")
      .eq("id", data.document_id)
      .maybeSingle();
    if (error) throw error;
    if (!doc || !doc.official_term_id) throw new Error("Not found");
    const { data: signed, error: se } = await context.supabase.storage
      .from("official-documents")
      .createSignedUrl(doc.storage_path, 600);
    if (se) throw se;
    return { url: signed.signedUrl };
  });

/** Remove the attached document from a task (deletes row + storage object). */
export const removeOfficialTaskDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ task_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId);
    const { data: task } = await context.supabase
      .from("official_task_instances")
      .select("evidence_document_id")
      .eq("id", data.task_id)
      .maybeSingle();
    const docId = task?.evidence_document_id as string | null | undefined;
    if (!docId) return { ok: true };
    const { data: doc } = await context.supabase
      .from("documents").select("storage_path").eq("id", docId).maybeSingle();
    await context.supabase.from("official_task_instances")
      .update({ evidence_document_id: null }).eq("id", data.task_id);
    await context.supabase.from("documents").delete().eq("id", docId);
    if (doc?.storage_path) {
      await context.supabase.storage.from("official-documents").remove([doc.storage_path]);
    }
    return { ok: true };
  });

/** Report: onboarding status per active/pending term, with completion metrics. */
export const officialOnboardingReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: terms, error } = await context.supabase
      .from("official_terms")
      .select(
        `id, start_date, end_date, status, appointment_type,
         officials(first_name, last_name, email),
         official_seats!inner(seat_label, official_bodies!inner(id, name, slug, kind)),
         official_onboarding_instances(id, status, template_id,
           official_onboarding_templates(name),
           official_task_instances(id, status, is_required, due_date, category, evidence_document_id))`,
      )
      .in("status", ["pending", "active"]);
    if (error) throw error;

    const rows = (terms ?? []).map((t: any) => {
      const inst = (t.official_onboarding_instances ?? [])[0];
      const tasks = (inst?.official_task_instances ?? []) as any[];
      const req = tasks.filter((x) => x.is_required);
      const doneReq = req.filter((x) => ["complete", "waived", "skipped"].includes(x.status));
      const overdue = tasks.filter(
        (x) => x.due_date && x.due_date < today && !["complete", "waived", "skipped"].includes(x.status),
      );
      const withDocs = tasks.filter((x) => !!x.evidence_document_id).length;
      const pct = req.length ? Math.round((doneReq.length / req.length) * 100) : (inst ? 100 : 0);
      const overall: "not_started" | "in_progress" | "complete" | "no_instance" = !inst
        ? "no_instance"
        : inst.status === "complete"
        ? "complete"
        : doneReq.length === 0
        ? "not_started"
        : "in_progress";
      return {
        term_id: t.id,
        official_name: `${t.officials?.first_name ?? ""} ${t.officials?.last_name ?? ""}`.trim(),
        email: t.officials?.email ?? null,
        body_name: t.official_seats?.official_bodies?.name ?? null,
        body_slug: t.official_seats?.official_bodies?.slug ?? null,
        body_kind: t.official_seats?.official_bodies?.kind ?? null,
        seat_label: t.official_seats?.seat_label ?? null,
        appointment_type: t.appointment_type,
        term_status: t.status,
        start_date: t.start_date,
        end_date: t.end_date,
        template_name: inst?.official_onboarding_templates?.name ?? null,
        overall_status: overall,
        pct_complete: pct,
        tasks_total: tasks.length,
        tasks_required: req.length,
        tasks_required_done: doneReq.length,
        overdue_count: overdue.length,
        docs_attached: withDocs,
      };
    });
    return rows;
  });