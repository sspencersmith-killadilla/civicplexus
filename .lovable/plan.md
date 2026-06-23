## Goal

Augment — not replace — human applicant review with AI that's defensible under public-sector hiring law. Every AI output is advisory, attributable, logged, and overridable. No AI signal alone may advance, reject, or rank a candidate without a recorded human action.

## Guardrails (these drive every feature below)

1. **Human-in-the-loop, always.** AI never writes to `job_applications.status`, `rating`, or `rejection_reason`. It only produces suggestions a human accepts, edits, or discards.
2. **EEOC / Title VII / state civil-service safety.** Prompts explicitly instruct the model to ignore and never infer protected characteristics (race, color, religion, sex, national origin, age, disability, genetic info, veteran/military status, pregnancy, marital status). Resumes are redacted before they hit the model (see §4).
3. **Job-relatedness.** Every scoring rubric is grounded in `job_requisitions` fields (title, description, required qualifications) supplied at call time. No "culture fit," no personality inference, no demographic proxies (ZIP, college prestige, name origin, graduation year, gaps).
4. **Disparate-impact monitoring.** Every AI-assisted decision is auditable. We add an `ai_suggestions` log so HR can run 4/5ths-rule reports later.
5. **Visible & disclosable.** Anywhere AI output appears in the UI, it's labeled "AI-assisted — review required" with the model name and timestamp. Required for NYC Local Law 144-style disclosure and Illinois/Maryland video-interview laws if the org expands.
6. **No autonomous communication.** AI can draft applicant-facing emails, but `applicant-emails.functions.ts` only sends after a human clicks Send. (Already the pattern — preserved.)
7. **PII minimization & retention.** Redacted payloads are what we send to the gateway. We don't store full prompts; we store the suggestion + a hash of the input + the model id. Resume files stay in storage.
8. **Override is first-class.** Every accept/edit/reject of a suggestion writes a `job_application_events` row so the trail shows the human decision, not the AI.

## Features (six, in order of value)

### 1. Resume redaction + structured parse (foundation)
Server function `parseApplicationResume(applicationId)`:
- Loads resume text (existing `resume_url` + cover_letter + answers).
- Runs a **deterministic redactor first** (regex/heuristic, no LLM): strips name, email, phone, address, photos, dates of birth, graduation years, and a configurable list of college/HS names if the org wants name-blind review.
- Then calls Lovable AI Gateway with a strict Zod `Output.object` schema → `{ years_experience, skills[], certifications[], prior_titles[], languages[], summary }`. No free-text demographic fields exist in the schema.
- Persists to a new `application_ai_parse` row (one per application, regenerable).
- All other features consume this parsed object — they never see raw resume text.

### 2. Rubric-scored screening (advisory)
On a requisition, HR defines a rubric (required skills, preferred skills, min years, must-have certs) — stored on `job_requisitions` as `ai_rubric jsonb`. Server function `scoreApplicationAgainstRubric` returns:
```
{ overall: 0-100, dimensions: [{label, score, evidence_quote}], missing_must_haves: [...], confidence: low|med|high }
```
- Evidence quotes must come from the parsed object; if the model can't cite evidence for a dimension, that dimension is marked "insufficient evidence" rather than scored low.
- UI shows the score next to the candidate with a "Why?" drawer and an explicit "Override / Disagree" button that records a reason.
- Suggested status changes (e.g. "consider advancing") are buttons a human clicks — never auto-applied.

### 3. Interview question generator
On the interview page, generate 6–10 behavioral / job-related questions tied to the rubric and the candidate's parsed background. Each question carries a tag for which rubric dimension it probes, so the same question bank is reused across candidates for that req (consistency = legal defensibility). Generated questions are saved on `interviews.notes` (or a new `interviews.question_bank jsonb`) so all interviewers use the same set.

### 4. Interview-feedback assistant
Two narrow tools on the interview detail page:
- **"Summarize my notes into structured feedback"** — takes the interviewer's free-text notes, returns a draft `{ rating, recommendation, strengths[], concerns[], evidence_quotes[] }`. Pre-fills the form; interviewer edits and submits.
- **"Compare panel feedback"** — once ≥2 `interview_feedback` rows exist, produces a side-by-side consensus/divergence summary for the hiring manager. Never produces a hire/no-hire verdict — only "where the panel agrees / disagrees."

### 5. Drafted applicant communication
Extend existing `applicant-emails.functions.ts` with `draftApplicantEmail({ application_id, intent: 'invite_to_interview' | 'request_info' | 'rejection' | 'offer_followup' })`. Returns subject + body draft using a tone profile from `org_settings`. Always opens the existing send dialog — never sends directly. Rejection drafts deliberately use neutral, non-specific language and link to the requisition's posted requirements.

### 6. Bias / fairness sweep (HR-admin only)
A nightly (or on-demand) server function for HR admins that:
- Pulls last N days of `ai_suggestions` + `job_application_events`.
- Reports score-distribution stats per requisition (no protected attributes — just counts and override rates).
- Flags requisitions where AI suggestions are accepted >X% without any edit (signals rubber-stamping) and where override rate is very high (signals rubric drift).

## Data model additions

```sql
-- One AI parse per application, regenerable
create table public.application_ai_parse (
  application_id uuid primary key references public.job_applications(id) on delete cascade,
  parsed jsonb not null,
  model text not null,
  redaction_version text not null,
  input_hash text not null,
  created_at timestamptz not null default now()
);

-- Generic AI suggestion log: rubric scores, question banks, email drafts, summaries
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.job_applications(id) on delete cascade,
  interview_id uuid references public.interviews(id) on delete cascade,
  kind text not null,                -- 'rubric_score' | 'interview_questions' | 'feedback_summary' | 'panel_compare' | 'email_draft'
  payload jsonb not null,
  model text not null,
  input_hash text not null,          -- so we don't store full prompt PII
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decision text,                     -- 'accepted' | 'edited' | 'rejected' | null
  decided_by uuid references auth.users(id),
  decision_diff jsonb                -- captures human edits vs AI suggestion
);

-- Rubric lives on the requisition
alter table public.job_requisitions
  add column ai_rubric jsonb not null default '{}'::jsonb;
```

Both new tables: GRANT to authenticated + service_role, RLS scoped exactly like `job_applications` / `interview_feedback` (HR admin OR requisition's hiring manager / requester OR — for `ai_suggestions` keyed to an interview — the interviewer). No `anon` grants.

## Server functions (all in `src/lib/`, all use `requireSupabaseAuth`)

- `applicant-ai.functions.ts`: `parseApplicationResume`, `scoreApplicationAgainstRubric`, `regenerateParse`
- `interview-ai.functions.ts`: `generateInterviewQuestions`, `summarizeInterviewNotes`, `comparePanelFeedback`
- Extension of `applicant-emails.functions.ts`: `draftApplicantEmail`
- `recruiting-fairness.functions.ts` (HR admin only, checks `has_role`): `aiFairnessReport`

Each handler:
1. Verifies caller can already read the underlying row (RLS does this naturally via `context.supabase`).
2. Loads only the fields needed; redactor runs before any model call.
3. Calls gateway with `Output.object` + Zod schema (no free-form JSON parsing).
4. Writes `ai_suggestions` row; returns suggestion id + payload.
5. On accept/edit/reject, separate function writes `decision`, `decision_diff`, and a `job_application_events` audit row.

Gateway uses the existing `src/lib/ai-gateway.server.ts` helper and `google/gemini-3-flash-preview` for scoring/parsing; reserve `google/gemini-3.5-flash` for the panel-compare and fairness summary calls.

## UI changes (no new routes — extend existing)

- `jobs.$id.tsx` (req detail): add "AI rubric" editor section; per-applicant row shows AI score chip + "Why?" drawer with the evidence quotes and explicit Accept / Override controls.
- `interviews.$id.tsx`: "Generate question bank" button (once, saved to interview); per-interviewer "Summarize my notes" assistant; hiring-manager "Compare panel" panel.
- Application detail (within jobs.$id.tsx): "AI-drafted email" option in the existing send dialog.
- Settings page: org-level toggles — enable/disable each AI feature, choose name-blind redaction strictness, set acceptance-rate alert threshold.
- Every AI surface carries the "AI-assisted — review required" badge + model name + generated-at timestamp.

## What we are explicitly NOT doing

- No automatic ranking that hides applicants.
- No "personality" / "culture fit" / video-tone analysis.
- No model training on candidate data.
- No AI-driven status changes or AI-sent emails.
- No protected-class inference, even for "diversity insights."
- No cross-requisition learning that could entrench past bias.

## Rollout order

1. Migration: `application_ai_parse`, `ai_suggestions`, `job_requisitions.ai_rubric` (+ grants + RLS).
2. `applicant-ai.functions.ts` with redactor + parse + score; add rubric editor + score chip in `jobs.$id.tsx`.
3. `interview-ai.functions.ts` + interview UI additions.
4. Email drafting + settings toggles.
5. Fairness report for HR admins.

Each step is independently shippable behind an `org_settings.ai_features` flag set defaulting to off.
