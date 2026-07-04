import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertHr(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data || data.length === 0) throw new Error("HR admin only");
}

/** Public — active org-wide base template. */
export const getActiveApplicationTemplate = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("application_form_templates")
    .select("id, name, schema, is_active, updated_at")
    .eq("is_active", true)
    .maybeSingle();
  return data ?? null;
});

/** Staff — list all templates. */
export const listApplicationTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHr(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("application_form_templates")
      .select("id, name, schema, is_active, updated_at, created_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

const SchemaShape = z.object({
  sections: z.array(z.object({
    title: z.string(),
    fields: z.array(z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      type: z.enum(["text", "email", "tel", "date", "number", "select", "boolean", "textarea"]),
      required: z.boolean().optional(),
      sensitive: z.boolean().optional(),
      options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    })),
  })),
});

/** Staff — upsert template. */
export const upsertApplicationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid().nullable().optional(),
      name: z.string().min(1).max(120),
      schema: SchemaShape,
      is_active: z.boolean().default(false),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.supabase, context.userId);
    const row = { name: data.name, schema: data.schema, is_active: data.is_active };
    if (data.id) {
      const { error } = await context.supabase.from("application_form_templates").update(row as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("application_form_templates").insert(row as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

/** Public — supplementals for a posted requisition. */
export const listSupplementalQuestions = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ requisition_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("job_supplemental_questions")
      .select("id, key, label, type, options, required, sort_order")
      .eq("requisition_id", data.requisition_id)
      .order("sort_order", { ascending: true });
    return rows ?? [];
  });

const QuestionShape = z.object({
  id: z.string().uuid().nullable().optional(),
  key: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/i, "Use letters, numbers, underscores"),
  label: z.string().min(1).max(300),
  type: z.enum(["text", "textarea", "email", "tel", "date", "number", "select", "boolean"]),
  options: z.array(z.object({ value: z.string(), label: z.string() })).nullable().optional(),
  required: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
});

/** Staff — replace all supplementals for a requisition atomically. */
export const saveSupplementalQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      requisition_id: z.string().uuid(),
      questions: z.array(QuestionShape),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.supabase, context.userId);
    // Delete removed, upsert the rest.
    const keepIds = data.questions.map((q) => q.id).filter(Boolean) as string[];
    let delQ = context.supabase.from("job_supplemental_questions").delete().eq("requisition_id", data.requisition_id);
    if (keepIds.length) delQ = delQ.not("id", "in", `(${keepIds.map((i) => `"${i}"`).join(",")})`);
    await delQ;
    if (data.questions.length) {
      const rows = data.questions.map((q, idx) => {
        const base = {
          requisition_id: data.requisition_id,
          key: q.key,
          label: q.label,
          type: q.type,
          options: q.options ?? null,
          required: q.required,
          sort_order: q.sort_order ?? idx,
        };
        return q.id ? { id: q.id, ...base } : base;
      });
      const { error } = await context.supabase.from("job_supplemental_questions").upsert(rows as never, { onConflict: "id" } as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.questions.length };
  });