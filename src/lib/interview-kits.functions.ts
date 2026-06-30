import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Question = z.object({
  id: z.string().min(1).max(40),
  prompt: z.string().trim().min(1).max(1000),
  think_seconds: z.number().int().min(0).max(600).default(60),
  max_answer_seconds: z.number().int().min(15).max(900).default(180),
  allow_retake: z.boolean().default(true),
});
const RubricItem = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(200),
  description: z.string().max(1000).optional().or(z.literal("")),
});

const KitInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["one_way", "live"]),
  description: z.string().max(2000).optional().or(z.literal("")),
  questions: z.array(Question).max(20),
  rubric: z.array(RubricItem).max(20).default([]),
  default_retention_days: z.number().int().min(7).max(3650).default(90),
  ai_assist_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

async function assertHr(ctx: { supabase: { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ role: string }> | null }> } } }; userId: string }) {
  const { data } = await (ctx.supabase as never as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ role: string }> | null }> } } })
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(data ?? []).some((r) => r.role === "hr_admin")) throw new Error("HR Admin only");
}

export const listInterviewKits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("interview_kits")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertInterviewKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => KitInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context as never);
    const row = {
      name: data.name,
      kind: data.kind,
      description: data.description || null,
      questions: data.questions,
      rubric: data.rubric,
      default_retention_days: data.default_retention_days,
      ai_assist_default: data.ai_assist_default,
      is_active: data.is_active,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("interview_kits").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("interview_kits").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

export const deleteInterviewKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertHr(context as never);
    const { error } = await context.supabase.from("interview_kits").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });