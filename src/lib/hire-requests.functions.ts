import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  job_title: z.string().trim().max(120).optional().or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  worker_type_id: z.string().uuid().nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("")),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const submitHireRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rid, error } = await context.supabase.rpc("create_hire_request", {
      _first_name: data.first_name,
      _last_name: data.last_name,
      _email: (data.email || null) as never,
      _job_title: (data.job_title || null) as never,
      _department: (data.department || null) as never,
      _worker_type_id: (data.worker_type_id || null) as never,
      _start_date: (data.start_date || null) as never,
      _reason: (data.reason || null) as never,
      _notes: (data.notes || null) as never,
    });
    if (error) throw new Error(error.message);
    return { request_id: rid as string };
  });

const decideSchema = z.object({
  request_id: z.string().uuid(),
  action: z.enum(["activate", "reject"]),
  hr_notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const decideHireRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decideSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("decide_hire_request", {
      _request_id: data.request_id,
      _action: data.action,
      _hr_notes: (data.hr_notes || null) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });