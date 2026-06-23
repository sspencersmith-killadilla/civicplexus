# Finish the Training Module

Builds on what already exists (assignments, mark-complete, overdue reminders, cron, supervisor RLS) and fills the remaining gaps that a municipal HR team would expect.

## What gets added

### 1. Course content & materials
- Add `description`, `passing_score`, `materials_url`, `content_md` (rich text / link block), `recurrence_months` (for annual safety etc.), `issues_certification_id` (link a course to a cert type), and `auto_assign_on_hire` to `courses`.
- Course detail view with description, materials link, and an "Assign" shortcut.

### 2. Auto-assign on hire
- When a new employee record is created (or worker_type changes), automatically create assignments for every active course whose `required_for_worker_types` includes that worker type **or** has `auto_assign_on_hire = true`, with a due date of `start_date + 30 days`.
- Done with a database trigger so it fires no matter how the employee was created (UI, import, hire request).

### 3. Completion evidence & scoring
- Mark-complete dialog with optional score and an optional **proof-of-completion file** (PDF/image) uploaded to a new private `training-evidence` storage bucket scoped per employee.
- If `score < passing_score` the row stays `assigned`; otherwise marked `complete`.
- If the course is linked to a certification type, completing it inserts/refreshes an `employee_certifications` row with `expires_at = now() + validity_months`.

### 4. Recurring training
- After a completion, if `recurrence_months` is set, schedule the next assignment automatically with `due_date = completed_at + recurrence_months`.
- A small nightly job in the existing reminders cron reopens recurring assignments that have come due.

### 5. Supervisor / approver view
- Add a "My Team" toggle to the Assignments tab that filters to direct reports only (uses existing `manager_id`).
- Bulk actions: re-assign, change due date, cancel.

### 6. Employee transcript
- `/my-hr/transcript` route: printable list of all completed training and active certifications with dates, scores, and download links for evidence.
- HR can open any employee's transcript from the employee detail page.

### 7. Compliance dashboard tab
- New "Compliance" tab on the Training page with:
  - % complete overall, by department, by worker type, and by compliance framework (OSHA, CJIS, HIPAA, etc.).
  - Overdue count and 30/60/90-day expiring certs.
  - Drill-down list under each tile.

### 8. CSV export
- Export buttons on Assignments, Compliance, and Cert Expiry tabs (matches the export pattern used elsewhere in the app).

### 9. Email notifications (in-app already exists)
- Reuse the existing email queue to send: assignment notice, 7-days-before-due, overdue (daily, capped), and cert-expiring (90/60/30/7 days). The cron already runs daily; we add the email side alongside the in-app `notifications` insert.

## Technical notes

- **Migration**:
  - `courses`: add columns above.
  - `employee_training`: add `evidence_path text`, `parent_id uuid` (for recurrence chain), `cancelled_at`, `cancelled_by`.
  - Trigger `tg_employees_autoassign_training` on `INSERT` / `worker_type_id` change on `employees`.
  - Trigger `tg_training_recurrence_and_cert` on `UPDATE` of `employee_training` when `status` becomes `complete` to (a) insert the cert row when `issues_certification_id` is set and (b) queue the next recurrence row.
  - New storage bucket `training-evidence` (private) + RLS so employees can upload/read their own and HR can read all.

- **Server functions** (`src/lib/training.functions.ts`):
  - Extend `completeTraining` to accept `evidence_path` and `score` and to enforce `passing_score`.
  - `cancelTrainingAssignment`, `reassignTraining`, `updateTrainingDueDate`.
  - `getEmployeeTranscript(employee_id)`.
  - `exportTrainingCsv(filters)`.

- **UI**:
  - `src/routes/_authenticated/training.tsx`: add **Compliance** tab, **My Team** toggle, bulk actions, CSV export buttons.
  - `src/routes/_authenticated/courses.$id.tsx`: course detail with materials & required-for settings.
  - `src/routes/_authenticated/transcript.$employeeId.tsx`: printable transcript.
  - Update `my-hr.tsx` mark-complete to a dialog supporting score + evidence upload.

- **Cron**: extend `dispatchTrainingReminders` to (a) send pre-due (7-day) reminders, (b) reopen recurring rows whose next-due has arrived, (c) push notifications into the existing email queue alongside the in-app `notifications` table.

## Out of scope (call out if you want them next)
- SCORM / xAPI content hosting
- External LMS sync (Cornerstone, Vector, TargetSolutions)
- Live instructor-led class rosters with seat limits
