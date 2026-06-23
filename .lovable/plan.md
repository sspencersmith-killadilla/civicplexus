## Short answer

Right now it isn't. The database has the scaffolding for human-in-the-loop AI in the applicant pool, but no UI surfaces it.

## What exists today

- **`public.application_ai_parse`** — one row per application holding `parsed jsonb` (resume parse), `model`, `redaction_version`, `input_hash`, `created_by`. No writer, no reader in the app.
- **`public.ai_suggestions`** — HITL-shaped table with `application_id` / `interview_id`, `kind`, `payload jsonb` (the AI proposal), plus `decision`, `decision_diff jsonb`, `decided_by`, `decided_at` (the human review). No writer, no reader in the app.
- **Applicant pool UI** (`src/routes/_authenticated/jobs.$id.tsx` → `ApplicantRow`): purely manual — status changes, schedule interview, draft offer, send rejection. No AI panel, no suggestions, no parse view.
- **Public apply route** (`src/routes/api/public/job-applications.ts`): inserts the application and resume but does not enqueue an AI parse or summary.

So the HITL plumbing is in the schema but nothing in the app generates suggestions, displays them, or records human accept/edit/reject.

## If you want to actually showcase HITL here

This is the minimum that would make it visible in the applicant pool:

1. **Generate on application submit** (server fn called from the apply route, via Lovable AI):
   - Resume parse → `application_ai_parse.parsed` (name, contact, years of experience, skills, education, work history).
   - "Screening summary" suggestion → `ai_suggestions` row with `kind='application_screen'` and `payload` = `{ fit_score, strengths[], gaps[], suggested_status, suggested_rejection_reason?, rationale }`.
2. **Applicant pool UI** (`jobs.$id.tsx`, expand `ApplicantRow`):
   - Inline **AI summary card** per applicant with fit score, strengths/gaps, and the AI's suggested next action.
   - HITL controls: **Accept**, **Edit** (opens the payload as an editable form, diff captured into `decision_diff`), **Reject suggestion**. Each writes `decision`, `decision_diff`, `decided_by`, `decided_at` on the `ai_suggestions` row, with a small "Reviewed by you · 2m ago" badge afterward.
   - "Show parsed resume" drawer reading from `application_ai_parse`.
3. **Backfill** existing demo applicants with one parse + one suggestion each so the screen has something to demo.
4. **Audit/trust affordances** already implied by the schema: show the model name, input hash, and timestamp on each suggestion so reviewers can see provenance.

## Out of scope

Bulk auto-advance, auto-rejection, or any flow that acts on AI output without an explicit human decision recorded in `ai_suggestions`.

## Files that would change

- `src/lib/applicant-ai.functions.ts` (new) — generate parse + suggestion, record decision.
- `src/routes/api/public/job-applications.ts` — fire-and-forget enqueue on submit.
- `src/routes/_authenticated/jobs.$id.tsx` — AI summary card + Accept/Edit/Reject controls in `ApplicantRow`, parsed-resume drawer.
- One migration to seed demo `application_ai_parse` + `ai_suggestions` rows for existing applicants.

Want me to build this, or were you only asking for the current state?
