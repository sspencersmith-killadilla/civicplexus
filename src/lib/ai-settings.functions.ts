import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiFeatureKey =
  | "applicant_screening"
  | "coaching"
  | "sql_helper"
  | "interview_kits"
  | "email_drafting";

export const AI_FEATURES: { key: AiFeatureKey; label: string }[] = [
  { key: "applicant_screening", label: "Applicant screening" },
  { key: "coaching", label: "1:1 coaching" },
  { key: "sql_helper", label: "SQL reports helper" },
  { key: "interview_kits", label: "Interview kit generator" },
  { key: "email_drafting", label: "Email drafting" },
];

export const AI_MODEL_CATALOG: string[] = [
  "openai/gpt-5.5",
  "openai/gpt-5.5-pro",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-nano",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-3.5-flash",
  "google/gemini-3.1-flash-lite",
];

export type AiSettings = {
  id: string;
  default_model: string;
  feature_overrides: Partial<Record<AiFeatureKey, string>>;
  byok: { provider?: "openai" | "anthropic" | "openrouter"; secret_name?: string; base_url?: string } | Record<string, never>;
  updated_at: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiSettings> => {
    const { data, error } = await (context.supabase as any)
      .from("ai_settings").select("*").limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { id: "", default_model: "openai/gpt-5.5", feature_overrides: {}, byok: {}, updated_at: new Date().toISOString() };
    return data as AiSettings;
  });

const Patch = z.object({
  default_model: z.string().min(2),
  feature_overrides: z.record(z.string(), z.string()).default({}),
  byok: z.object({
    provider: z.enum(["openai", "anthropic", "openrouter"]).optional(),
    secret_name: z.string().optional(),
    base_url: z.string().url().optional(),
  }).default({}),
});

export const updateAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Patch.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await (context.supabase as any).from("ai_settings").select("id").limit(1).maybeSingle();
    if (row?.id) {
      const { error } = await (context.supabase as any).from("ai_settings").update({
        default_model: data.default_model,
        feature_overrides: data.feature_overrides,
        byok: data.byok,
        updated_by: context.userId,
      }).eq("id", row.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await (context.supabase as any).from("ai_settings").insert({
        default_model: data.default_model,
        feature_overrides: data.feature_overrides,
        byok: data.byok,
        updated_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Resolve the effective model for a given feature. */
export async function resolveModelFor(feature: AiFeatureKey, supabase: any, fallback = "openai/gpt-5.5"): Promise<string> {
  const { data } = await supabase.from("ai_settings").select("default_model, feature_overrides").limit(1).maybeSingle();
  const override = (data?.feature_overrides ?? {})[feature];
  return override || data?.default_model || fallback;
}