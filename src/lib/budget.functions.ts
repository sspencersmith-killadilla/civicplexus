import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkPositionBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { department: string; additional_fte?: number }) =>
    z.object({ department: z.string().min(1), additional_fte: z.number().default(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("check_position_budget", {
      _department: data.department,
      _additional_fte: data.additional_fte,
    });
    if (error) throw new Error(error.message);
    return result as {
      has_budget: boolean;
      fiscal_year: number;
      department: string;
      budgeted_fte?: number;
      used_fte?: number;
      requested_fte?: number;
      remaining_fte?: number;
      would_exceed?: boolean;
    };
  });
