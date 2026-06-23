import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertHr(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "hr_admin");
  if (!data?.length) throw new Error("Forbidden — HR admin only");
}

async function eligibleEmployees(filter: { departments?: string[]; worker_type_ids?: string[] }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin.from("employees").select("id,department,worker_type_id,user_id,first_name,last_name").eq("status", "active");
  if (filter.departments?.length) q = q.in("department", filter.departments);
  if (filter.worker_type_ids?.length) q = q.in("worker_type_id", filter.worker_type_ids);
  const { data } = await q;
  return data ?? [];
}

export const createPolicyCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      policy_id: z.string().uuid(),
      name: z.string().min(2).max(150),
      due_date: z.string().optional().nullable(),
      departments: z.array(z.string()).optional(),
      worker_type_ids: z.array(z.string().uuid()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const filter = { departments: data.departments, worker_type_ids: data.worker_type_ids };
    const { data: camp, error } = await supabaseAdmin.from("policy_campaigns").insert({
      policy_id: data.policy_id,
      name: data.name,
      due_date: data.due_date || null,
      audience_filter: filter,
      status: "active",
      created_by: context.userId,
    }).select().single();
    if (error) throw new Error(error.message);
    const emps = await eligibleEmployees(filter);
    if (emps.length) {
      await supabaseAdmin.from("policy_campaign_assignments").insert(
        emps.map((e) => ({ campaign_id: camp.id, employee_id: e.id }))
      );
      const notifs = emps.filter((e) => e.user_id).map((e) => ({
        user_id: e.user_id!,
        type: "policy_campaign",
        title: `Acknowledge: ${data.name}`,
        body: data.due_date ? `Due by ${data.due_date}` : "Action required",
        link: `/policies/${data.policy_id}`,
      }));
      if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);
    }
    return { campaign_id: camp.id, assigned: emps.length };
  });

export const closePolicyCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("policy_campaigns").update({ status: "closed" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const campaignStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHr(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("policy_campaign_assignments")
      .select("status,employee_id,employees(first_name,last_name,department,user_id)")
      .eq("campaign_id", data.id);
    const list = rows ?? [];
    return {
      total: list.length,
      complete: list.filter((r) => r.status === "complete").length,
      pending: list.filter((r) => r.status === "pending").length,
      rows: list,
    };
  });