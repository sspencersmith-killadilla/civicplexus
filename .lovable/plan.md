## What we're building

Four additions on top of the existing Coaching module:

1. **Seeded 1-on-1 templates** (curated set inspired by the Leader Hub repo's pattern of per-purpose meeting templates).
2. **Annual performance reviews** that auto-pull a year's worth of 1-on-1 notes/action items + goal progress into a draft.
3. **Grievances** — confidential employee-submitted complaints with an HR investigation/resolution workflow and audit trail.
4. **Org-chart batch import** — CSV upload for Positions and Employees (including manager/reports-to links) with a downloadable template.

---

## 1. 1-on-1 templates (seed data)

The McKinney repo seeds templates in the DB (only a 3-question default lives in code). We'll seed a municipal-flavored set into `one_on_one_templates` via migration:

- **Weekly Check-in** (default) — wins, blockers, priorities for next week, support needed
- **Bi-weekly Coaching** — progress on goals, skill development, feedback exchange
- **Monthly Career Growth** — career aspirations, growth areas, learning plan, stretch opportunities
- **Quarterly Goals Review** — goal progress, recalibration, new commitments
- **Project Retro 1-on-1** — what went well, what didn't, lessons, next steps
- **New Hire 30-day** — onboarding experience, role clarity, early wins, friction
- **New Hire 60/90-day** — ramp progress, relationships, performance signals
- **Skip-Level** — directs' team health, manager effectiveness, org concerns
- **Return-from-Leave** — re-onboarding, workload calibration, support
- **Performance Concern** — expectations, gaps, support plan, follow-up cadence (HR-visible flag)

Each row populates `agenda_prompts` (jsonb array of question strings). The existing 1-on-1 detail page already renders the chosen template — no UI changes needed.

## 2. Annual reviews

### Schema
- `performance_reviews` — `employee_id`, `manager_user_id`, `review_period_start/end`, `status` (draft/manager_complete/employee_acknowledged/finalized), `manager_narrative`, `employee_self_assessment`, `overall_rating` (1-5), `ratings` jsonb (per-competency), `ai_draft`, `ai_generated_at`, `finalized_at`.
- `performance_review_signatures` — manager + employee signature timestamps + IP, separate from the row for audit integrity.
- Reuse existing `audit_events` for change history.
- RLS: employee can read their own + sign; manager can read/write theirs; `hr_admin` full access.

### Server functions (`src/lib/reviews.functions.ts`)
- `createAnnualReview({ employee_id, period_start, period_end })` — manager/HR only.
- `compileReviewContext({ review_id })` — pulls all `one_on_ones` + `one_on_one_action_items` + `goals` + `goal_updates` for that employee in the period; returns a structured summary.
- `generateReviewDraft({ review_id })` — feeds compiled context to Lovable AI (same gateway as coaching-ai), produces markdown narrative + suggested ratings; stored in `ai_draft`.
- `finalizeReview({ review_id })` — locks fields, requires both signatures.

### UI
- `src/routes/_authenticated/reviews.index.tsx` — list (filter mine/team/all), "New review" dialog.
- `src/routes/_authenticated/reviews.$id.tsx` — tabs: Context (read-only roll-up of 1-on-1s/goals), Manager Narrative, Self-Assessment, Ratings, Signatures.
- Sidebar entry under Coaching.

## 3. Grievances

### Schema
- `grievances` — `submitted_by` (auth.uid), `subject_employee_id` (optional — who it's about), `category` (harassment, retaliation, policy, pay, safety, other), `summary`, `details`, `is_anonymous`, `status` (submitted/triage/investigating/resolved/closed/withdrawn), `severity`, `assigned_hr_id`, `resolution_summary`, `resolved_at`.
- `grievance_notes` — investigator notes with `visibility` (`hr_only`, `shared_with_submitter`).
- `grievance_attachments` — links to documents in the existing `onboarding-documents` storage bucket (reuse).
- RLS: submitter sees their own submissions + shared notes; `hr_admin` sees all; everyone else is blocked. All status changes write to `audit_events`.

### UI
- `src/routes/_authenticated/grievances.index.tsx` — "File a grievance" form for any signed-in user; HR sees a triage queue.
- `src/routes/_authenticated/grievances.$id.tsx` — case view with timeline, notes (visibility toggle), status workflow buttons (HR only), resolution panel.
- Sidebar entry "Grievances" (visible to all; HR sees queue, others see only their own).

## 4. Org-chart batch import

### Templates (downloadable CSV)
- **Positions template:** `position_code, title, department, flsa_class, pay_grade, pay_step, budgeted_fte, reports_to_position_code, status, notes`
- **Employees template:** `employee_external_id, first_name, last_name, work_email, personal_email, phone, department, job_title, position_code, manager_employee_external_id, worker_type, start_date, status`

### Server functions (`src/lib/org-import.functions.ts`)
- `previewOrgImport({ kind, csv_text })` — parses, validates, returns row-level diagnostics (new vs match, errors) without writing.
- `commitOrgImport({ kind, csv_text, mode })` — `mode` = `insert_only` | `upsert`. Resolves `reports_to_position_code` and `manager_employee_external_id` in a second pass so forward references work. Writes one `audit_events` row per inserted/updated record plus a batch summary row.
- Both gated to `hr_admin`.
- Employees keyed on a new optional `external_id text unique` column (added via migration) to make idempotent re-imports safe; falls back to email if no external_id.

### UI
- `src/routes/_authenticated/employees.import.tsx` already exists — extend it with tabs: "Employees" (existing) and "Positions" (new), plus a "Download template" button on each. Show preview diagnostics table before commit.
- Add the same import entry point from the Positions page.

---

## Technical notes

- All new tables follow the project's GRANT → RLS → POLICY order; `has_role` from `private` schema is reused.
- AI calls reuse `src/lib/ai-gateway.server.ts` + `LOVABLE_API_KEY`.
- CSV parsing uses a tiny in-repo parser (no new dependency) — comma-separated, quoted fields, header row required.
- All write paths log to `audit_events` for compliance.

## Out of scope (call out)

- Cross-year review comparisons / calibration sessions
- Grievance auto-routing rules (manual HR triage only)
- Excel/.xlsx import (CSV only this turn — easy follow-up)
- Org-chart visualization (data only; visualization can be a follow-up)
