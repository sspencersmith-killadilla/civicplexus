import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createHash } from "crypto";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";
const REDACTION_VERSION = "v1";

function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

/** Deterministic redactor. Runs before any model call. */
function redact(text: string, opts: { applicantName?: string | null; nameBlind: boolean }) {
  let t = text ?? "";
  // emails, phones, URLs, SSN-like, long digit runs
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
  t = t.replace(/\+?\d[\d().\s-]{7,}\d/g, "[phone]");
  t = t.replace(/https?:\/\/\S+/g, "[url]");
  t = t.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn]");
  // graduation/birth years (1900-2099) -> [year]
  t = t.replace(/\b(19|20)\d{2}\b/g, "[year]");
  // street addresses (number + word + street/ave/rd/blvd)
  t = t.replace(/\b\d{1,6}\s+[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*\s+(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)\b/gi, "[address]");
  if (opts.nameBlind && opts.applicantName) {
    const parts = opts.applicantName.split(/\s+/).filter((p) => p.length > 1);
    for (const p of parts) {
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      t = t.replace(re, "[name]");
    }
  }
  return t;
}

const ParseSchema = z.object({
  years_experience: z.number().min(0).max(60).nullable(),
  skills: z.array(z.string()).max(40),
  certifications: z.array(z.string()).max(20),
  prior_titles: z.array(z.string()).max(20),
  languages: z.array(z.string()).max(15),
  summary: z.string().max(800),
});
type ParsedApplication = z.infer<typeof ParseSchema>;

async function loadAiFeatures(supabase: ReturnType<typeof clientShape>) {
  const { data } = await supabase.from("org_settings" as never).select("ai_features").limit(1).maybeSingle();
  const row = data as unknown as { ai_features: Record<string, boolean> } | null;
  return row?.ai_features ?? {};
}
// helper just to type the client without importing it here
function clientShape() {
  return undefined as unknown as {
    from: (t: string) => {
      select: (s: string) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> } };
    };
  };
}

const SYSTEM_RULES = `You evaluate municipal job applications.
Strict rules — violating any is a failure:
- Ignore and never infer protected characteristics (race, color, religion, sex, national origin, age, disability, genetic info, veteran/military status, pregnancy, marital status, sexual orientation).
- Do not use proxies for protected characteristics (zip code, college prestige, name origin, graduation year, employment gaps).
- Base every judgment ONLY on job-related qualifications: skills, certifications, prior responsibilities, education relevance, years of experience.
- If evidence is insufficient for a judgment, say "insufficient evidence" rather than guess.
- You produce advisory output for a human reviewer; you do not make decisions.`;

export const parseApplicationResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ application_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: appRow, error: aErr } = await context.supabase
      .from("job_applications" as never)
      .select("id, applicant_name, cover_letter, answers, resume_url")
      .eq("id", data.application_id)
      .maybeSingle();
    if (aErr || !appRow) throw new Error("Application not found or no access");
    const app = appRow as unknown as { id: string; applicant_name: string; cover_letter: string | null; answers: Record<string, unknown> | null; resume_url: string | null };

    const features = await loadAiFeatures(context.supabase as unknown as ReturnType<typeof clientShape>);
    const nameBlind = features["name_blind_redaction"] !== false; // default on

    const answerText = Object.values(app.answers ?? {})
      .filter((v): v is string => typeof v === "string")
      .join("\n");
    const raw = [app.cover_letter ?? "", answerText].filter(Boolean).join("\n\n").trim();
    if (!raw) throw new Error("No cover letter or written answers to parse. PDF resume parsing is not yet supported — ask the applicant to paste resume text.");

    const redacted = redact(raw, { applicantName: app.applicant_name, nameBlind });
    const inputHash = createHash("sha256").update(redacted).digest("hex").slice(0, 32);

    const prompt = `${SYSTEM_RULES}

Extract a structured profile from the redacted application text below.
Return strictly the JSON schema requested. Do not invent facts. If a field has no evidence, use null or [].

Application text:
${redacted}`;

    const { experimental_output } = await generateText({
      model: gateway()(MODEL),
      prompt,
      experimental_output: Output.object({ schema: ParseSchema }),
    });
    const parsed = experimental_output as ParsedApplication;

    await context.supabase
      .from("application_ai_parse" as never)
      .upsert({
        application_id: data.application_id,
        parsed,
        model: MODEL,
        redaction_version: REDACTION_VERSION,
        input_hash: inputHash,
        created_by: context.userId,
      } as never);

    await context.supabase.from("audit_events").insert({
      actor_id: context.userId,
      action: "ai_parse_application",
      entity: "job_application",
      entity_id: data.application_id,
      diff: { model: MODEL, redaction_version: REDACTION_VERSION },
    });

    return { parsed, model: MODEL };
  });

const RubricSchema = z.object({
  required_skills: z.array(z.string()).max(20).optional(),
  preferred_skills: z.array(z.string()).max(20).optional(),
  must_have_certifications: z.array(z.string()).max(20).optional(),
  min_years_experience: z.number().min(0).max(40).nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export const saveRequisitionRubric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    requisition_id: z.string().uuid(),
    rubric: RubricSchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("job_requisitions" as never)
      .update({ ai_rubric: data.rubric } as never)
      .eq("id", data.requisition_id);
    if (error) throw error;
    return { ok: true };
  });

const ScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  confidence: z.enum(["low", "medium", "high"]),
  dimensions: z.array(z.object({
    label: z.string().max(80),
    score: z.number().min(0).max(100).nullable(),
    evidence: z.string().max(280),
    insufficient_evidence: z.boolean(),
  })).max(12),
  missing_must_haves: z.array(z.string()).max(20),
  caveats: z.array(z.string()).max(10),
});
type Score = z.infer<typeof ScoreSchema>;

export const scoreApplicationAgainstRubric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ application_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: appRow } = await context.supabase
      .from("job_applications" as never)
      .select("id, requisition_id, job_requisitions:requisition_id(title, department, summary, ai_rubric)")
      .eq("id", data.application_id)
      .maybeSingle();
    const app = appRow as unknown as { requisition_id: string; job_requisitions: { title: string; department: string | null; summary: string | null; ai_rubric: Record<string, unknown> } } | null;
    if (!app) throw new Error("Application not found or no access");

    const { data: parseRow } = await context.supabase
      .from("application_ai_parse" as never)
      .select("parsed")
      .eq("application_id", data.application_id)
      .maybeSingle();
    const parsed = (parseRow as unknown as { parsed: ParsedApplication } | null)?.parsed;
    if (!parsed) throw new Error("Parse this application first before scoring.");

    const rubric = app.job_requisitions.ai_rubric ?? {};
    if (!rubric || Object.keys(rubric).length === 0) throw new Error("This requisition has no AI rubric yet. Set one on the requisition first.");

    const payload = {
      requisition: { title: app.job_requisitions.title, department: app.job_requisitions.department, summary: app.job_requisitions.summary },
      rubric,
      parsed_profile: parsed,
    };
    const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);

    const prompt = `${SYSTEM_RULES}

You are scoring a candidate against a job rubric. Cite a direct evidence quote from the parsed profile for every dimension. If you cannot cite evidence, set insufficient_evidence=true and score=null. Never penalize for employment gaps, graduation year, or name. Confidence reflects how much rubric coverage you could ground in evidence.

Input:
${JSON.stringify(payload, null, 2)}`;

    const { experimental_output } = await generateText({
      model: gateway()(MODEL),
      prompt,
      experimental_output: Output.object({ schema: ScoreSchema }),
    });
    const score = experimental_output as Score;

    const { data: ins, error: insErr } = await context.supabase
      .from("ai_suggestions" as never)
      .insert({
        application_id: data.application_id,
        kind: "rubric_score",
        payload: score,
        model: MODEL,
        input_hash: inputHash,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (insErr) throw insErr;
    const suggestionId = (ins as unknown as { id: string }).id;

    return { suggestion_id: suggestionId, score, model: MODEL };
  });

export const decideSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    suggestion_id: z.string().uuid(),
    decision: z.enum(["accepted", "edited", "rejected"]),
    decision_diff: z.record(z.string(), z.unknown()).optional(),
    reason: z.string().max(500).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: sug } = await context.supabase
      .from("ai_suggestions" as never)
      .select("id, application_id, interview_id, kind")
      .eq("id", data.suggestion_id)
      .maybeSingle();
    const s = sug as unknown as { id: string; application_id: string | null; interview_id: string | null; kind: string } | null;
    if (!s) throw new Error("Suggestion not found or no access");

    const { error } = await context.supabase
      .from("ai_suggestions" as never)
      .update({
        decision: data.decision,
        decision_diff: data.decision_diff ?? (data.reason ? { reason: data.reason } : {}),
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      } as never)
      .eq("id", data.suggestion_id);
    if (error) throw error;

    if (s.application_id) {
      await context.supabase.from("job_application_events" as never).insert({
        application_id: s.application_id,
        actor_id: context.userId,
        event_type: `ai_${s.kind}_${data.decision}`,
        payload: { suggestion_id: s.id, reason: data.reason ?? null },
      } as never);
    }
    return { ok: true };
  });
