import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "employee-photos";

async function assertHrAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "hr_admin")
    .maybeSingle();
  if (!data) throw new Error("HR admin only");
}

const ShowFields = z.object({
  title: z.boolean().default(true),
  department: z.boolean().default(true),
  employee_id: z.boolean().default(true),
  start_date: z.boolean().default(false),
  barcode: z.boolean().default(false),
  qr: z.boolean().default(true),
});

const TemplateInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  org_name: z.string().min(1).max(120),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0F3460"),
  orientation: z.enum(["landscape", "portrait"]).default("landscape"),
  show_fields: ShowFields,
  back_text: z.string().max(2000).nullable().optional(),
  is_default: z.boolean().default(false),
});

export const upsertBadgeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TemplateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context.supabase, context.userId);
    if (data.is_default) {
      await context.supabase.from("id_badge_templates" as never).update({ is_default: false } as never).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const payload = {
      name: data.name, org_name: data.org_name, accent_color: data.accent_color,
      orientation: data.orientation, show_fields: data.show_fields,
      back_text: data.back_text ?? null, is_default: data.is_default,
    };
    if (data.id) {
      const { error } = await context.supabase.from("id_badge_templates" as never).update(payload as never).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("id_badge_templates" as never).insert({ ...payload, created_by: context.userId } as never).select("id").single();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

export const deleteBadgeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("id_badge_templates" as never).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

function appBase(req?: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (req) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (host) return `${proto}://${host}`;
  }
  return "";
}

export const generateBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    employee_id: z.string().uuid(),
    template_id: z.string().uuid().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context.supabase, context.userId);
    const { renderBadgePdf } = await import("./id-badges-pdf.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: emp, error: ee } = await context.supabase
      .from("employees")
      .select("id, first_name, last_name, job_title, department, start_date, photo_path")
      .eq("id", data.employee_id).single();
    if (ee || !emp) throw new Error("Employee not found");

    let tpl: any = null;
    if (data.template_id) {
      const { data: t } = await context.supabase.from("id_badge_templates" as never).select("*").eq("id", data.template_id).maybeSingle();
      tpl = t;
    }
    if (!tpl) {
      const { data: t } = await context.supabase.from("id_badge_templates" as never).select("*").eq("is_default", true).maybeSingle();
      tpl = t;
    }
    if (!tpl) {
      const { data: org } = await context.supabase.from("org_settings").select("org_name").limit(1).maybeSingle();
      tpl = {
        id: null, org_name: (org as any)?.org_name ?? "Our Organization", accent_color: "#0F3460",
        orientation: "landscape", show_fields: { title: true, department: true, employee_id: true, qr: true },
      };
    }

    // Photo bytes
    let photo: Uint8Array | null = null;
    if ((emp as any).photo_path) {
      const { data: file } = await supabaseAdmin.storage.from(BUCKET).download((emp as any).photo_path);
      if (file) photo = new Uint8Array(await file.arrayBuffer());
    }

    const serial = `BDG-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const base = appBase((context as { request?: Request }).request);
    const verify_url = `${base}/api/public/badge/${serial}`;

    const pdfBytes = await renderBadgePdf({
      org_name: tpl.org_name,
      accent_color: tpl.accent_color ?? "#0F3460",
      display_name: `${(emp as any).first_name ?? ""} ${(emp as any).last_name ?? ""}`.trim(),
      job_title: (emp as any).job_title ?? "",
      department: (emp as any).department ?? "",
      employee_code: ((emp as any).id as string).slice(0, 8).toUpperCase(),
      serial,
      verify_url,
      show: {
        title: !!tpl.show_fields?.title,
        department: !!tpl.show_fields?.department,
        employee_id: !!tpl.show_fields?.employee_id,
        qr: tpl.show_fields?.qr !== false,
      },
      photo_png: photo,
    });

    const path = `badges/${data.employee_id}/${serial}.pdf`;
    const { error: ue } = await supabaseAdmin.storage.from(BUCKET).upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (ue) throw ue;

    const { error: be } = await context.supabase.from("id_badges" as never).insert({
      employee_id: data.employee_id,
      template_id: tpl.id ?? null,
      serial, pdf_path: path,
      issued_by: context.userId,
    } as never);
    if (be) throw be;

    const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600);
    return { serial, pdf_url: signed?.signedUrl ?? null, verify_url };
  });

export const getBadgePdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ badge_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("id_badges" as never).select("pdf_path").eq("id", data.badge_id).maybeSingle();
    const path = (row as { pdf_path: string | null } | null)?.pdf_path;
    if (!path) throw new Error("Badge PDF not available");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

export const revokeBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ badge_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("id_badges" as never)
      .update({ revoked_at: new Date().toISOString(), revoked_by: context.userId } as never)
      .eq("id", data.badge_id);
    if (error) throw error;
    return { ok: true };
  });