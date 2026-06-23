import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const cascadeGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    parent_goal_id: z.string().uuid(),
    children: z.array(z.object({
      owner_employee_id: z.string().uuid(),
      title: z.string().min(2).max(300),
      description: z.string().max(4000).optional(),
      target_date: z.string().optional().nullable(),
      weight: z.number().min(0.1).max(10).default(1),
    })).min(1).max(50),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: parent, error: pErr } = await context.supabase
      .from("goals").select("category").eq("id", data.parent_goal_id).single();
    if (pErr) throw new Error(pErr.message);
    const rows = data.children.map((c) => ({
      owner_employee_id: c.owner_employee_id,
      title: c.title,
      description: c.description ?? null,
      category: (parent as { category: string }).category,
      target_date: c.target_date ?? null,
      weight: c.weight,
      parent_goal_id: data.parent_goal_id,
      created_by: context.userId,
    }));
    const { error } = await context.supabase.from("goals").insert(rows as never);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });