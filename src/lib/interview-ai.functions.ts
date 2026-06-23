import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output } from "ai";
import { createHash } from "crypto";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";
const PANEL_MODEL = "google/gemini-3.5-flash";

function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

const SYSTEM_RULES = `You support municipal hiring panels. Strict rules:
- Never reference or infer protected characteristics (race, color, religion, sex, national origin, age, disability, genetic info, veteran/military status, pregnancy, marital status, sexual orientation).
- Stay job-related: skills, prior responsibilities, certifications, scenario judgment.
- Use behavioral / situational structure (STAR). Ban personality or "culture fit" questions.
- You produce advisory text for human reviewers; you never make hiring decisions.`;

const QuestionsSchema = z.object({
  questions: z.array(z.object({
    text: z.string().max(400),
    rubric_dimension: z.string().max(80),
    rationale: z.string().max(280),
  })).min(4).max(12),
});
type Questions = z.infer<typeof QuestionsSchema>;

export const generateInterviewQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ interview_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ivRow } = await context.supabase
      .from("interviews" as never)
      .select("id, stage, application_id, job_applications:application_id(requisition_id, job_requisitions:requisition_id(title, department, summary, ai_rubric))")
      .eq("id", data.interview_id)
      .maybeSingle();
    const iv = ivRow as unknown as { application_id: string; stage: string; job_applications: { requisition_id: string; job_requisitions: { title: string; department: string | null; summary: string | null; ai_rubric: Record<string, unknown> } } } | null;
    if (!iv) throw new Error("Interview not found or no access");

    const { data: parseRow } = await context.supabase
      .from("application_ai_parse" as never)
      .select("parsed")
      .eq("application_id", iv.application_id)
      .maybeSingle();
    const parsed = (parseRow as unknown as { parsed: unknown } | null)?.parsed ?? null;

    const payload = {
      requisition: iv.job_applications.job_requisitions,
      stage: iv.stage,
      parsed_profile: parsed,
    };
    const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);

    const prompt = `${SYSTEM_RULES}

Generate a question bank for this interview stage. Each question must:
- Tie to a specific rubric dimension (use rubric labels where present).
- Be behavioral or scenario-based, job-related, and the SAME questions all candidates for this req will receive (for fairness / civil-service defensibility).
- Probe the rubric, not the candidate's personal background.

Input:
${JSON.stringify(payload, null, 2)}`;

    const { experimental_output } = await generateText({
      model: gateway()(MODEL),
      prompt,
      experimental_output: Output.object({ schema: QuestionsSchema }),
    });
    const out = experimental_output as Questions;

    const { data: ins, error: insErr } = await context.supabase
      .from("ai_suggestions" as never)
      .insert({
        interview_id: data.interview_id,
        application_id: iv.application_id,
        kind: "interview_questions",
        payload: out,
        model: MODEL,
        input_hash: inputHash,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { suggestion_id: (ins as unknown as { id: string }).id, questions: out.questions, model: MODEL };
  });

const FeedbackSchema = z.object({
  rating_suggestion: z.number().min(1).max(5),
  recommendation_suggestion: z.enum(["strong_hire", "hire", "no_hire", "strong_no_hire"]),
  strengths: z.array(z.string()).max(6),
  concerns: z.array(z.string()).max(6),
  evidence_quotes: z.array(z.string()).max(8),
  open_questions: z.array(z.string()).max(6),
});
type FeedbackDraft = z.infer<typeof FeedbackSchema>;

export const summarizeInterviewNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    interview_id: z.string().uuid(),
    notes: z.string().min(20).max(8000),
  }).parse(input))
  .handler(async ({ data, context }) => {
    // RLS check: caller must already be able to read this interview
    const { data: iv } = await context.supabase
      .from("interviews" as never).select("id, application_id").eq("id", data.interview_id).maybeSingle();
    if (!iv) throw new Error("Interview not found or no access");
    const ivR = iv as unknown as { application_id: string };

    const inputHash = createHash("sha256").update(data.notes).digest("hex").slice(0, 32);
    const prompt = `${SYSTEM_RULES}

Turn the interviewer's raw notes into a STRUCTURED draft scorecard. Cite evidence quotes from the notes verbatim. Rating and recommendation are SUGGESTIONS the interviewer will review and override as needed.

Notes:
${data.notes}`;

    const { experimental_output } = await generateText({
      model: gateway()(MODEL),
      prompt,
      experimental_output: Output.object({ schema: FeedbackSchema }),
    });
    const draft = experimental_output as FeedbackDraft;

    const { data: ins, error: insErr } = await context.supabase
      .from("ai_suggestions" as never)
      .insert({
        interview_id: data.interview_id,
        application_id: ivR.application_id,
        kind: "feedback_summary",
        payload: draft,
        model: MODEL,
        input_hash: inputHash,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { suggestion_id: (ins as unknown as { id: string }).id, draft, model: MODEL };
  });

const PanelSchema = z.object({
  consensus: z.array(z.string()).max(8),
  divergences: z.array(z.object({ topic: z.string().max(120), positions: z.array(z.string()).max(6) })).max(8),
  unresolved_questions: z.array(z.string()).max(8),
  notes: z.string().max(800),
});
type PanelCompare = z.infer<typeof PanelSchema>;

export const comparePanelFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ interview_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: fb, error } = await context.supabase
      .from("interview_feedback" as never)
      .select("rating, recommendation, notes")
      .eq("interview_id", data.interview_id);
    if (error) throw error;
    const rows = (fb ?? []) as Array<{ rating: number; recommendation: string; notes: string | null }>;
    if (rows.length < 2) throw new Error("Need at least 2 interviewer scorecards to compare.");

    const inputHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 32);
    const prompt = `${SYSTEM_RULES}

Compare the panel's individual scorecards below. Output:
- Where the panel AGREES (consensus).
- Where they DISAGREE (divergences) with each interviewer's position summarized.
- Open questions the hiring manager should resolve before deciding.

You must NOT recommend hire / no-hire — only describe the panel's positions.

Scorecards:
${JSON.stringify(rows, null, 2)}`;

    const { experimental_output } = await generateText({
      model: gateway()(PANEL_MODEL),
      prompt,
      experimental_output: Output.object({ schema: PanelSchema }),
    });
    const out = experimental_output as PanelCompare;

    const { data: ivRow } = await context.supabase
      .from("interviews" as never).select("application_id").eq("id", data.interview_id).maybeSingle();
    const ivR = ivRow as unknown as { application_id: string } | null;

    const { data: ins, error: insErr } = await context.supabase
      .from("ai_suggestions" as never)
      .insert({
        interview_id: data.interview_id,
        application_id: ivR?.application_id ?? null,
        kind: "panel_compare",
        payload: out,
        model: PANEL_MODEL,
        input_hash: inputHash,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { suggestion_id: (ins as unknown as { id: string }).id, comparison: out, model: PANEL_MODEL };
  });
