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

/** HR creates a signed upload URL for an employee photo (HR only). */
export const createEmployeePhotoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    employee_id: z.string().uuid(),
    content_type: z.string().regex(/^image\/(png|jpe?g|webp)$/),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = data.content_type === "image/png" ? "png" : data.content_type === "image/webp" ? "webp" : "jpg";
    const path = `photos/${data.employee_id}/${Date.now()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw error;
    return { path, signed_url: signed.signedUrl, token: signed.token };
  });

/** Persist the storage path on the employee record after upload finishes. */
export const confirmEmployeePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    employee_id: z.string().uuid(),
    path: z.string().min(3),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("employees")
      .update({ photo_path: data.path })
      .eq("id", data.employee_id);
    if (error) throw error;
    return { ok: true };
  });

/** Short-lived signed GET URL for any authenticated user that can see the employee. */
export const getEmployeePhotoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ path: z.string().min(3) }).parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(data.path, 600);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

/** HR removes the photo reference (storage object stays for audit). */
export const clearEmployeePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ employee_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("employees")
      .update({ photo_path: null })
      .eq("id", data.employee_id);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Generate an AI portrait for the next demo employee that has no photo,
 * upload it to storage, and persist photo_path. Returns progress so the
 * client can loop until done. HR admin only.
 */
export const seedNextDemoPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ regenerate: z.boolean().optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertHrAdmin(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pick the next employee needing a photo
    let query = supabaseAdmin
      .from("employees")
      .select("id, first_name, last_name, job_title, photo_path")
      .order("last_name");
    if (!data.regenerate) query = query.is("photo_path", null);
    const { data: rows, error } = await query.limit(1);
    if (error) throw error;
    const emp = rows?.[0];
    if (!emp) return { done: true, remaining: 0 };

    // Count remaining (after this one)
    const { count } = await supabaseAdmin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .is("photo_path", null);

    const prompt =
      `Professional corporate headshot portrait of a person named ${emp.first_name} ${emp.last_name}, ` +
      `working as a ${emp.job_title ?? "municipal employee"} for a small city government. ` +
      `Friendly natural smile, shoulders up, looking at the camera, neutral light grey studio background, ` +
      `soft even lighting, business casual attire, photorealistic, sharp focus, no text, no logo, no watermark.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-image-2",
        prompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      throw new Error(`Image gen failed (${aiRes.status}): ${txt.slice(0, 200)}`);
    }
    const json = (await aiRes.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image returned");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const path = `photos/${emp.id}/seed-${Date.now()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw upErr;

    const { error: updErr } = await supabaseAdmin
      .from("employees")
      .update({ photo_path: path })
      .eq("id", emp.id);
    if (updErr) throw updErr;

    const remaining = Math.max(0, (count ?? 1) - 1);
    return {
      done: remaining === 0,
      remaining,
      employee: { id: emp.id, name: `${emp.first_name} ${emp.last_name}` },
    };
  });