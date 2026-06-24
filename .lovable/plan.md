## Goal

Make the PAF (Personnel Action Form) workflow end-to-end usable, add a real offboarding process that flows through PAF + a task checklist, fall back to a configured "main admin" when an employee has no supervisor, and close the loose ends in the employee lifecycle (preboarding → active → leave → separation → rehire).

## 1. PAF workflow fixes

**Submission (`src/lib/paf.functions.ts`)**
- Stop requiring "you must be the direct manager." Instead allow: HR admin, or any user who is the subject employee's `manager_id`, or supervisor/hiring_manager roles submitting for their own reports. HR admins can submit for anyone.
- Resolve approvers to **named users**, not just a role bucket, so the approval chain has a clear owner:
  - Stage 1 (`supervisor`): employee's `manager_id` → `user_id`. If null/unmapped, fall back to the configured fallback admin (see §4).
  - Stage 2 (`hr_admin`): all hr_admin users (any one can approve).
- Persist `approver_id` on `approval_steps` when known (already a column) so notifications and "my approvals" queues work.
- Action-type aware default chains:
  - `separation` → supervisor → hr_admin (+ optional it_admin step if any provisioning exists)
  - `pay_change`, `promotion`, `demotion`, `reclassification` → supervisor → hr_admin
  - `transfer`, `position_change` → current supervisor → new supervisor → hr_admin
  - `leave_start`, `leave_return` → supervisor → hr_admin
  - `hire`/`rehire` → hr_admin only (initiated by HR)

**Approval (existing `decide_paf_step` RPC)**
- Already correct — when last step approves, PAF flips to `approved`. Keep as-is, but on approval auto-notify the next approver (by `approver_id` first, else role pool), and on final approval notify HR admins to apply.

**Apply (`applyPaf`)**
- Expand allowed fields to include separation fields: `separation_date`, `separation_reason`, `rehire_eligible`, `end_date`.
- For `separation` action, additionally:
  - Set employee `status = 'offboarded'`, copy effective_date → `separation_date`.
  - Auto-create an `offboarding_instance` (new lightweight table OR reuse `onboarding_instances` with a `kind` column — see §2) and seed standard tasks.
  - Cancel future `employee_training` rows with status `assigned`.
  - Mark open `provisioning_requests` as `revoke_pending` (insert opposite-direction rows).
- For `leave_start`: set status to `on_leave` (add to `employee_status` enum if missing).
- For `leave_return`: set status back to `active`.

**UI (`paf.index.tsx`, `paf.$id.tsx`)**
- Replace raw JSON `after_values` textarea with action-type-specific forms:
  - Separation: separation date, reason (voluntary / involuntary / retirement / end_of_term / deceased), rehire eligible, last-day notes.
  - Pay change: new annual / hourly, new grade.
  - Transfer / position change: new department, new position, new manager.
  - Leave start/return: leave plan, start/return dates.
- Show approver names on each stage and an "Approve" button only for the named approver or HR admin.
- Add empty-state and filter by status / mine-to-approve.

## 2. Full offboarding process

- Add `offboarding_templates` + `offboarding_template_tasks` (parallel to onboarding tables), seeded with: exit interview scheduled, final timesheet submitted, equipment returned, building/library access revoked, IT account disabled, benefits COBRA packet sent, final pay calculated, TMRS separation reported, knowledge transfer documented, manager attestation.
- Add `offboarding_instances` + reuse `task_instances` by adding nullable `offboarding_instance_id` column (mirror of `onboarding_instance_id`).
- Rewrite `src/routes/_authenticated/offboarding.tsx`:
  - "Start Offboarding" now creates a PAF (`separation`) and an offboarding instance with seeded tasks. It does NOT directly flip employee status.
  - List shows in-flight offboardings with task progress, owner, target last day.
  - Surface `apply` button when PAF is approved.
- Add a "Mark deceased / immediate termination" HR-only fast path that creates an auto-approved PAF.

## 3. Hire-request → preboarding → active loose ends

- `create_hire_request` already seeds onboarding; verify and add: if no supervisor was set, default `manager_id` to fallback admin (so notifications + approvals don't dead-end).
- `preboarding.tsx`: surface candidates with no tasks (template missing) and let HR pick a template ad-hoc.
- Add an HR action on the employee page to manually transition `candidate → preboarding → active → on_leave → offboarded` (audited), so stuck employees aren't orphaned.

## 4. "Main admin" fallback

- Add `org_settings.fallback_admin_user_id uuid` (single org row already exists).
- Add a small admin UI in `/admin-modules` (or new `/admin-org`) to pick the fallback admin from hr_admin users.
- Use it everywhere we currently dead-end on a missing supervisor: PAF stage-1 resolution, hire request notifications, onboarding manager assignment, review cycle manager assignment, comp cycle, one-on-one pairing.

## 5. Other lifecycle dead ends to clean up

- **Approvals inbox**: `/approvals` currently lists nothing PAF-related — extend to show pending `approval_steps` where the current user is `approver_id` OR holds `approver_role`.
- **Notifications**: PAF notify currently spams all hr_admins for every step — restrict to the specific approver when resolved.
- **`employee_status` enum**: confirm/add `on_leave` and `offboarded` values; add migration if missing.
- **Audit**: existing `tg_paf_log_changes` covers status changes; add audit row for `applied` action (currently silent).
- **Self-service**: employee can see their own PAFs (read-only) on `/my-hr` — currently no surface.

## Technical notes

- All schema changes are additive: new tables (`offboarding_templates`, `offboarding_template_tasks`, `offboarding_instances`), one nullable column on `task_instances`, one column on `org_settings`, possibly one enum value. Every new public table gets the standard GRANT + RLS + policy block per project rules.
- `submitPaf` keeps the existing authorization shape; we relax the "direct manager only" check to "HR admin OR submitting for self-managed report OR supervisor/hiring_manager role". The previously fixed security finding (`submit_paf_no_authz`) stays satisfied because we still reject everyone else and still reject self-submission.
- `applyPaf` stays HR-admin-only.
- No edits to integration-managed Supabase files. `paf_audit` writes continue to go through `record_paf_audit` where called from app code.

## Out of scope

- Payroll-side termination accruals math, COBRA packet PDF generation, and TMRS file regeneration on separation (we'll queue the task — generation already lives in the compliance module).
- Reorganizing the existing approvals page UX beyond surfacing PAF steps.
