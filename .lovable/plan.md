## Performance & Goals — Build Plan

The bones exist (`performance_reviews`, `performance_review_signatures`, `goals`, `goal_updates`, `one_on_ones*`, `cascades`). What's missing is the *cycle* wrapper, calibration, structured 1:1 prep, goal cascading/check-ins, and a single manager view that pulls it together. This plan closes those gaps.

### 1. Review Cycles (new)
- New table `review_cycles`: `name`, `period_start`, `period_end`, `kickoff_at`, `self_review_due`, `manager_review_due`, `signoff_due`, `status (draft|open|in_calibration|closed)`, `eligibility_filter (jsonb)`, `template_key`.
- New table `review_cycle_participants`: `cycle_id`, `employee_id`, `manager_id`, `review_id?`, `status (not_started|self_submitted|manager_submitted|acknowledged|finalized)`.
- HR launches a cycle → trigger seeds `performance_reviews` rows for every eligible employee (active on `period_end`, optionally filtered by department/worker type) and notifies managers + employees.
- Daily cron in `reminders.ts`: ping self-review when overdue, escalate to manager 3 days after `manager_review_due`, notify HR for unsigned reviews past `signoff_due`.
- New UI: `/_authenticated/review-cycles/` (HR list + launcher) and `/_authenticated/review-cycles/$id` (progress bar, per-participant status, "send reminder" / "reopen" actions, CSV export).

### 2. Review Detail Upgrades
- Add structured rating sections: replace single `overall_rating` with a `review_ratings` table (`competency`, `rating`, `comment`) seeded from `org_settings.review_competencies` (new JSON setting with a sensible default — communication, ownership, craft, collaboration, growth).
- Acknowledgement step: when employee signs, automatically push status to `employee_acknowledged`; manager signature flips to `finalized` and locks the row (DB trigger denies further UPDATEs once finalized except by `hr_admin`).
- Generate a printable PDF of the finalized review via `print:` CSS and a "Download" button (browser print → save as PDF; no server-side rendering, keeps Worker-safe).
- Reviewee self-assessment becomes its own step with a separate submit button + lock when submitted.

### 3. Calibration
- New page `/_authenticated/review-cycles/$id/calibration` (HR + executives only):
  - Grid by department × rating distribution.
  - Inline edit of `overall_rating` with audit row in new `review_rating_changes` table (`review_id`, `from`, `to`, `changed_by`, `reason`, `at`).
  - "Mark cycle as calibrated" gate before participants can be notified to acknowledge.

### 4. 1:1 Upgrades
- Pre-meeting prep: surface unresolved action items, recent goal updates, and last 1:1 highlights in `one_on_ones.$id.tsx` sidebar.
- Recurring schedule: add `cadence_weeks` + `next_scheduled_at` on `one_on_ones`; nightly cron auto-creates the next session 7 days before due.
- Shared agenda: separate visibility flag on `one_on_one_agenda_notes` already exists — add inline "shared/private" toggle and a "carry over to next" action that copies an item into the next scheduled session.

### 5. Goals — Cascade & Check-ins
- Add `parent_goal_id uuid` + `weight numeric` on `goals` for parent/child cascading. Computed rollup: parent progress = weighted avg of children (server-side helper).
- "Cascade from goal" UX on `goals.tsx`: pick a parent goal, pick direct reports, draft child goals in one dialog.
- Weekly check-in prompt: nightly cron inserts a `notifications` row every Monday for any goal owner with no `goal_updates` in the past 7 days and status `in_progress`.
- Manager view on dashboard: "Team goals at risk" (status `off_track` or no update >14 days).

### 6. Manager Dashboard Panel
- New section "My Team — Performance" on `dashboard.tsx` for users who are managers (has direct reports):
  - Reviews due this cycle (count + link).
  - Goals at risk.
  - Overdue 1:1s (>30 days since last session per report).
  - Pending acknowledgements.

### 7. Notifications & Audit
- Every state transition (cycle open, self submitted, manager submitted, signed, calibrated, finalized, rating changed) emits a `notifications` row to the right party and an `audit_events` row.

### Technical layout
- Migrations:
  - `review_cycles`, `review_cycle_participants`, `review_ratings`, `review_rating_changes` tables with `GRANT` + RLS (HR full, manager scoped to direct reports, employee scoped to own).
  - Triggers: `tg_seed_review_cycle`, `tg_review_lock_when_finalized`, `tg_goal_rollup` (recompute parent progress on update).
  - Add columns `parent_goal_id`, `weight` on `goals`; `cadence_weeks`, `next_scheduled_at` on `one_on_ones`.
  - Seed `org_settings.review_competencies` default.
- Server functions (`src/lib/`):
  - `review-cycles.functions.ts`: `launchCycle`, `closeCycle`, `markCalibrated`, `sendCycleReminder`.
  - Extend `reviews.functions.ts`: `submitSelfAssessment`, `submitManagerReview`, `acknowledgeReview`, `updateRatings`, `recalibrateRating`.
  - Extend `goals.functions.ts` (new file): `cascadeGoal`, `recomputeParent`.
  - Extend `reminders.ts` cron with the 4 new schedules above.
- Routes:
  - New: `_authenticated/review-cycles.index.tsx`, `_authenticated/review-cycles.$id.tsx`, `_authenticated/review-cycles.$id.calibration.tsx`.
  - Updated: `reviews.$id.tsx` (ratings grid, lock, PDF print), `goals.tsx` (cascade dialog, parent badge), `one-on-ones.$id.tsx` (prep sidebar, carry-over), `dashboard.tsx` (manager panel), `reminders.ts`.

### Out of scope
- 360 / peer reviews, compensation planning, succession matrix (9-box), real e-signature provider integration, calibration video calls.

### Acceptance checks
- HR launches a cycle → every eligible employee has a `performance_reviews` row and gets notified.
- Self → Manager → Calibration → Acknowledge → Finalize works end-to-end; finalized review cannot be edited.
- Manager can cascade a goal to 3 reports in one action; parent progress reflects weighted child progress automatically.
- Manager dashboard surfaces overdue 1:1s, at-risk goals, and pending reviews accurately for direct reports only.
