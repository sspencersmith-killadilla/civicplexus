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