## Goal
Make the internal application flow feel like "one click + a short note," not a rebuilt external application. Pull everything we already know about the employee, ask only for what a hiring manager actually reads.

## Auto-populated internal resume
Build the resume server-side from existing HR data — no re-entry:
- **Header**: name, current title, department, work email, hire date, tenure, location, badge ID
- **Current role**: position title, worker type, supervisor, salary grade (if permitted)
- **Work history**: prior `positions` / `personnel_actions` for this employee (promotions, transfers, reclassifications)
- **Certifications**: `employee_certifications` + `tcole_licenses` (issue/expiry)
- **Training**: `employee_training` completions (last 5 years, condensed)
- **Performance**: last 1-2 `performance_reviews` overall rating + reviewer (opt-in; employee can uncheck sections)
- **Goals**: recent completed `goals` as "accomplishments"
- **Education / external experience**: pulled from `employees` profile if present; otherwise a single free-text block the employee can fill once and reuse across future internal apps

Rendered as a preview panel on the apply dialog + attached as a snapshot JSON to `job_applications` so the record is immutable at time of submission.

## Slimmer apply dialog
Replace the current one-textarea dialog with:
1. **Resume preview** (collapsible sections, each with a checkbox to include/exclude)
2. **Cover letter / "Why this role"** — required, short (300-1500 chars), with 2-3 prompt hints ("What draws you to this role? What would you bring? Any relevant experience not in your record?")
3. **Optional Q&A**: if the requisition has `job_supplemental_questions`, show internal-flagged ones only (skip generic external ones like "authorized to work in US")
4. **Notify current supervisor** checkbox (default on, but auto-detect supervisor from employee record and show the name)
5. **Acknowledge**: "My supervisor may be contacted" — single checkbox

## Other improvements
- **Eligibility hints on the card**: show green/amber badges before the dialog opens — "Meets minimum tenure," "Missing required cert: X," "Probation ends in 45 days." Reads from requisition requirements + employee record. Non-blocking (informational) unless HR marks a rule as hard-gate.
- **One-click re-apply**: if the employee has applied internally before, offer "Reuse last cover letter" and "Reuse resume selections."
- **Application status tracker**: in `/my-hr`, a small "My internal applications" panel showing status (submitted / reviewing / interview / decision) with timestamps — currently the employee submits and hears nothing.
- **Confidentiality toggle**: option "Do not notify my supervisor until I'm a finalist" (routes to HR only until interview stage) — big driver of whether people apply.
- **Withdraw button**: employee can withdraw their own application from the tracker.
- **HR-side view**: hiring manager sees the auto-resume as the primary view (not a wall of form fields), with a "View HR file" deep link for authorized reviewers.

## Technical notes
- New server fn `buildInternalResume({ requisition_id })` — returns structured JSON assembled from `employees`, `positions`, `personnel_actions`, `employee_certifications`, `tcole_licenses`, `employee_training`, `performance_reviews`, `goals`. Respects RLS; salary/review data gated by permission.
- Extend `applyInternally` input with `resume_snapshot` (JSONB), `included_sections` (string[]), `supplemental_answers` (JSONB), `confidential_until_finalist` (bool). Store snapshot on `job_applications` (add `internal_resume_snapshot jsonb`, `confidential_until_finalist bool` columns).
- New server fn `listMyInternalApplications` for the tracker panel; `withdrawMyApplication` for the withdraw button.
- Eligibility check server fn `evaluateInternalEligibility({ requisition_id })` — returns `{ passes: [], warnings: [], blockers: [] }` based on requisition requirements text + employee record (kept simple; string-matching + explicit rules HR sets on the requisition).
- UI: rewrite `src/routes/_authenticated/internal-careers.tsx` dialog into a multi-section sheet; add tracker section to `src/routes/_authenticated/my-hr.tsx`; add auto-resume panel to hiring-manager application detail view.

## Not doing (unless you want them)
- Manager endorsements / references
- Skills self-rating matrix
- Video cover letter
- Fully separate "internal talent profile" that the employee maintains outside of HR data (adds maintenance burden; the whole point is to skip data re-entry)