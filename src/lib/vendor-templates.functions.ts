import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertHr(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data || data.length === 0) throw new Error("HR admin only");
}

const FieldShape = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/i),
  label: z.string().min(1),
  type: z.enum(["text", "email", "tel", "date", "number", "select", "boolean", "textarea", "file"]),
  required: z.boolean().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  help: z.string().optional(),
});
const SchemaShape = z.object({
  sections: z.array(z.object({
    title: z.string(),
    fields: z.array(FieldShape),
  })),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/** Public — active default vendor template, or by slug. */
export const getPublicVendorTemplate = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ slug: z.string().optional() }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("vendor_form_templates").select("id, name, slug, description, category, schema").eq("is_active", true);
    if (data.slug) q = q.eq("slug", data.slug);
    else q = q.eq("is_default", true);
    const { data: row } = await q.maybeSingle();
    return row ?? null;
  });

export const listPublicVendorTemplates = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("vendor_form_templates")
    .select("id, name, slug, description, category")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name");
  return data ?? [];
});

export const listVendorTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHr(context.supabase, context.userId);
    const { data } = await context.supabase.from("vendor_form_templates").select("*").order("updated_at", { ascending: false });
    return data ?? [];
  });

export const upsertVendorTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid().nullable().optional(),
    name: z.string().min(1).max(120),
    description: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    schema: SchemaShape,
    is_active: z.boolean().default(true),
    is_default: z.boolean().default(false),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context.supabase, context.userId);
    if (data.is_default) {
      await context.supabase.from("vendor_form_templates").update({ is_default: false }).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const row = {
      name: data.name,
      slug: slugify(data.name),
      description: data.description ?? null,
      category: data.category ?? null,
      schema: data.schema,
      is_active: data.is_active,
      is_default: data.is_default,
    };
    if (data.id) {
      const { slug: _slug, ...update } = row;
      const { error } = await context.supabase.from("vendor_form_templates").update(update).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("vendor_form_templates").insert({ ...row, created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    return ins as { id: string };
  });

export const deleteVendorTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context.supabase, context.userId);
    const { error } = await context.supabase.from("vendor_form_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });