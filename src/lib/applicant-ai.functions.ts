import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";
const KIND = "application_screen";

function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

const SuggestedStatus = z.enum(["advance", "interview", "reject", "hold"]);
const ScreenPayload = z.object({
  fit_score: z.number().min(0).max(100),
  strengths: z.array(z.string().max(300)).max(8),
  gaps: z.array(z.string().max(300)).max(8),
  suggested_status: SuggestedStatus,
  suggested_rejection_reason: z.string().max(500).optional().nullable(),
  rationale: z.string().max(2000),
});
export type ScreenPayload = z.infer<typeof ScreenPayload>;

/**
 * Generate an AI screening suggestion for a job application.
 * Writes one row to `ai_suggestions` with `kind='application_screen'`.
 * Always requires a human to accept/edit/reject before any action is taken.
 */
export const screenApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ application_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: appRow, error: aErr } = await context.supabase
      .from("job_applications")
      .select("id, requisition_id, applicant_name, email, cover_letter")
      .eq("id", data.application_id)
      .maybeSingle();
    if (aErr || !appRow) throw new Error("Application not found or no access");

    const { data: reqRow, error: rErr } = await context.supabase
      .from("job_requisitions")
      .select("title, department, summary, description, requirements, posting_sections")
      .eq("id", (appRow as { requisition_id: string }).requisition_id)
      .maybeSingle();
    if (rErr || !reqRow) throw new Error("Requisition not found");

    const { data: parseRow } = await context.supabase
      .from("application_ai_parse")
      .select("parsed")
      .eq("application_id", data.application_id)
      .maybeSingle();
    const parsed = (parseRow as { parsed: { resume_text?: string } } | null)?.parsed ?? {};
    const resumeText = (parsed.resume_text ?? "").slice(0, 8000);

    const sections = (reqRow as { posting_sections: Record<string, string | null> | null }).posting_sections ?? {};
    const reqContext = [
      `Title: ${(reqRow as { title: string }).title}`,
      `Department: ${(reqRow as { department: string | null }).department ?? "n/a"}`,
      `Summary: ${(reqRow as { summary: string | null }).summary ?? ""}`,
      `Essential functions: ${sections?.essential_functions ?? ""}`,
      `KSAs: ${sections?.ksa ?? ""}`,
      `Qualifications: ${sections?.qualifications ?? (reqRow as { requirements: string | null }).requirements ?? ""}`,
    ].join("\n").slice(0, 6000);

    const candidate = [
      `Name: ${(appRow as { applicant_name: string }).applicant_name}`,
      `Cover letter: ${(appRow as { cover_letter: string | null }).cover_letter ?? "(none)"}`,
      `Resume text:\n${resumeText || "(no parsed resume text — base assessment on cover letter only)"}`,
    ].join("\n\n");

    const prompt = `You are an HR screening assistant for a municipal employer. Your job is to draft a fair, evidence-based screening summary for a recruiter to review. The recruiter — a human — will accept, edit, or reject your suggestion before any action is taken on the candidate. Be conservative, cite concrete evidence from the resume/cover letter only, and never infer protected characteristics.

Return STRICT JSON only, no markdown, matching this exact shape:
{
  "fit_score": <integer 0-100>,
  "strengths": ["short bullet", ...],
  "gaps": ["short bullet", ...],
  "suggested_status": "advance" | "interview" | "reject" | "hold",
  "suggested_rejection_reason": "<short reason if suggested_status is 'reject', else null>",
  "rationale": "<2-4 sentence plain-English justification a recruiter could paste into a hiring discussion>"
}

REQUISITION CONTEXT:
${reqContext}

CANDIDATE:
${candidate}`;

    const { text } = await generateText({ model: gateway()(MODEL), prompt });

    let payload: ScreenPayload;
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      payload = ScreenPayload.parse(JSON.parse(cleaned));
    } catch {
      throw new Error("AI returned malformed JSON; try again");
    }

    const { data: ins, error: insErr } = await context.supabase
      .from("ai_suggestions")
      .insert({
        application_id: data.application_id,
        kind: KIND,
        payload: payload as unknown as Record<string, unknown>,
        model: MODEL,
        created_by: context.userId,
      } as never)
      .select()
      .single();
    if (insErr) throw insErr;

    await context.supabase.rpc("record_audit_event" as never, {
      _action: "ai_screen", _entity: "job_application", _entity_id: data.application_id,
      _diff: { model: MODEL, fit_score: payload.fit_score },
    } as never);

    return ins as unknown as { id: string };
  });

/**
 * Record the human-in-the-loop decision on an AI screening suggestion.
 * `edited_payload` is required when decision is 'edited' — its diff vs the
 * original `payload` is stored in `decision_diff` so the audit trail shows
 * exactly what the reviewer changed.
 */
export const recordScreenDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    suggestion_id: z.string().uuid(),
    decision: z.enum(["accepted", "edited", "rejected"]),
    edited_payload: ScreenPayload.optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ai_suggestions")
      .select("id, payload")
      .eq("id", data.suggestion_id)
      .maybeSingle();
    if (error || !row) throw new Error("Suggestion not found or no access");

    let diff: Record<string, { from: unknown; to: unknown }> | null = null;
    let finalPayload = (row as { payload: Record<string, unknown> }).payload;
    if (data.decision === "edited") {
      if (!data.edited_payload) throw new Error("edited_payload required for decision=edited");
      const original = (row as { payload: Record<string, unknown> }).payload;
      const edited = data.edited_payload as unknown as Record<string, unknown>;
      diff = {};
      for (const k of new Set([...Object.keys(original), ...Object.keys(edited)])) {
        const a = JSON.stringify(original[k]);
        const b = JSON.stringify(edited[k]);
        if (a !== b) diff[k] = { from: original[k], to: edited[k] };
      }
      finalPayload = edited;
    }

    const { error: upErr } = await context.supabase
      .from("ai_suggestions")
      .update({
        decision: data.decision,
        decision_diff: diff,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        ...(data.decision === "edited" ? { payload: finalPayload } : {}),
      } as never)
      .eq("id", data.suggestion_id);
    if (upErr) throw upErr;

    await context.supabase.rpc("record_audit_event" as never, {
      _action: "ai_screen_decision", _entity: "ai_suggestion", _entity_id: data.suggestion_id,
      _diff: { decision: data.decision, notes: data.notes ?? null, changed_keys: diff ? Object.keys(diff) : [] },
    } as never);

    return { ok: true };
  });