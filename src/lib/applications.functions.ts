import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type App = {
  id: string;
  requisition_id: string;
  applicant_name: string;
  email: string;
  status: string;
  is_internal: boolean;
  rating: number | null;
  created_at: string;
};

async function authorize(context: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }) {
  const { supabase, userId } = context;
  const [{ data: roles }, { data: perms }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.rpc("get_effective_permissions", { _uid: userId }),
  ]);
  const roleSet = new Set(((roles ?? []) as Array<{ role: string }>).map((r) => r.role));
  const permSet = new Set(((perms ?? []) as Array<{ permission_key: string }>).map((p) => p.permission_key));
  return {
    isHr: roleSet.has("hr_admin"),
    canReadAll: roleSet.has("hr_admin") || permSet.has("applications.read"),
  };
}

export const listApplicationsForRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requisition_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { maskApplicant } = await import("@/lib/applicant-alias");
    const { canReadAll, isHr } = await authorize(context);

    if (!canReadAll) {
      // Must be hiring manager / requester on this requisition
      const { data: req } = await supabaseAdmin
        .from("job_requisitions")
        .select("hiring_manager_id, requested_by")
        .eq("id", data.requisition_id).maybeSingle();
      const r = req as { hiring_manager_id: string | null; requested_by: string | null } | null;
      if (!r || (r.hiring_manager_id !== context.userId && r.requested_by !== context.userId)) {
        throw new Error("Not authorized to view applications for this requisition");
      }
    }

    const { data: reqRow } = await supabaseAdmin
      .from("job_requisitions").select("blind_review").eq("id", data.requisition_id).maybeSingle();
    const blindReview = (reqRow as { blind_review: boolean } | null)?.blind_review ?? true;

    const { data: apps, error } = await supabaseAdmin
      .from("job_applications")
      .select("id, requisition_id, applicant_name, email, status, is_internal, rating, created_at, alias_color, alias_animal")
      .eq("requisition_id", data.requisition_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((apps ?? []) as Array<App & { alias_color: string | null; alias_animal: string | null }>)
      .map((a) => maskApplicant(a, { isHr, blindReview }));
  });