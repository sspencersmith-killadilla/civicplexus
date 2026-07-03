
## 1. Elected Officials page — wire all top actions

Repair every header action so nothing dead-ends. Target actions on `/admin-officials`:

- **Export CSV** — call existing `exportOfficialsCsv` (or add if missing) and download via `downloadCsv`.
- **Onboarding report** — link to `/admin-officials/onboarding-report` (route exists).
- **Onboarding templates** — link to `/admin-officials/onboarding-templates` (route exists).
- **Print roster** — link to `/admin-officials/print` (route exists), open in new tab.
- **Archive** — link to `/admin-officials/archive` (route exists).
- **New body** — already working; leave alone.
- **Public directory** — link to `/officials`.

Add loading + toast states, keyboard focus, and empty-state fallbacks. Confirm each button has an `onClick` or `<Link>` and is not a bare `<Button>`.

## 2. Board applications — in-app review, ranking, appoint-to-seat

Replace the CSV-only workflow on `/admin-officials` (Applications tab) with a real review surface.

**Detail view** (`/admin-officials/applications/$id`)
- Applicant profile: name, contact, statement, cover letter (signed URL preview inline), interests (primary + others), status, audit trail.
- Status controls: submitted → under_review → shortlisted → approved/declined/withdrawn (already in enum) with notes.

**Council ranking / scoring**
- New table `board_application_scores` (application_id, scorer_user_id, body_id, score 1–5, comments, created_at). RLS: council members + clerk/hr write own row; clerk/hr read all; scorer reads own.
- Each council member scores applicants for bodies they're assigned to. Aggregate average shown on the list + detail view.

**Side-by-side compare** (`/admin-officials/applications/compare?body=<id>`)
- Select a body → grid of applicants for that body with statement snippet, avg score, per-scorer rankings, and quick "Appoint" action.

**Appoint to seat**
- "Appoint" button on detail/compare view → picker of vacant `official_seats` for the interest body → server fn `appointApplicantToSeat` that:
  - Creates `officials` row (from application name/email/phone) if none exists.
  - Creates `official_terms` row (seat_id, official_id, start/end dates).
  - Sets application status = approved, logs to `board_application_audit`.
  - Sends notification / email (reuse existing email template scaffold).

## 3. Editable job applications + supplemental questions

**City-wide base application template** (editable by HR)
- New table `application_form_templates` (org-wide, single active row) storing a JSON schema compatible with the existing `FormRunner` (`sections[].fields[]`).
- New admin route `/admin/application-template` — drag/drop-ish field editor (add/remove/reorder fields, mark required, choose type from text/email/tel/date/select/textarea/boolean). Uses existing `FormRunner` for live preview.
- Seed with the current hardcoded application shape so existing apply pages keep working.

**Per-posting supplemental questions**
- New table `job_supplemental_questions` (job_id, order, key, label, type, required, options jsonb).
- `job_requisitions` edit page (`/jobs/$id`) gets a "Supplemental questions" section — HR adds/edits/reorders questions per posting.
- Public apply page (`/careers/$slug/apply`) renders base template + posting's supplemental section. Required supplementals block submit.
- Stored in `job_applications` as `answers` jsonb (base) + `supplemental_answers` jsonb (posting-specific).
- Applicant/admin views show both blocks.

## 4. Per-position job descriptions autopopulate

- Add `default_description` (long text) + `default_requirements` (long text) to `positions` (already links to requisitions via title/dept — verify FK; add if missing).
- Position editor (`/positions`) gets rich-text/markdown fields for description + requirements.
- When creating a `job_requisition`, "Position" picker prefills `description`/`requirements` from the position's defaults; still fully editable on the requisition (no back-sync — postings stay independent once created).

## 5. Volunteer & Contractor/Vendor workflows

Two parallel tracks modeled after the existing employee/applicant patterns.

**Schema (new tables, each with GRANTs + RLS)**
- `volunteers` (name, contact, status, department_id, skills[], background_check_date, waiver_signed_at, notes).
- `volunteer_hours` (volunteer_id, date, hours, activity, approved_by).
- `vendors` (legal_name, dba, contact, tax_id encrypted, status, department_id, contract_value, contract_start, contract_end, w9_path, coi_path, coi_expires_at, insurance_verified).
- `vendor_assignments` (vendor_id, project/dept, role, start/end).
- `volunteer_applications` + `vendor_applications` (public intake, mirror of job applications shape).
- Onboarding templates reuse existing `onboarding_templates`/`template_tasks` with a `kind` enum extension (`employee|volunteer|vendor`).

**Public intake**
- `/serve/volunteer` and `/serve/vendor` public pages — editable form via same `application_form_templates` mechanism (kind = volunteer/vendor).

**Staff surfaces**
- `/volunteers` — directory, filter by dept/status, assign, log hours, compliance flags (waiver missing, background expired).
- `/vendors` — directory, assign to projects, COI expiration alerts on dashboard, upload W-9/COI to secure bucket.
- Onboarding checklist run per volunteer/vendor.

**Compliance**
- Reuse existing notifications system for expiring COI, background checks, waiver anniversaries.
- Add compliance widgets to dashboard for HR admin.

## Technical details

**Migrations** (grouped, all with GRANTs + RLS scoped to HR/clerk/council roles as appropriate):
1. `board_application_scores`
2. `application_form_templates`
3. `job_supplemental_questions`
4. `positions.default_description`, `positions.default_requirements`
5. `volunteers`, `volunteer_hours`, `volunteer_applications`
6. `vendors`, `vendor_assignments`, `vendor_applications`
7. Extend `onboarding_templates.kind`

**Server functions**
- `officials-export.functions.ts` — verify CSV export server fn is wired.
- `board-applications.functions.ts` — add `scoreApplication`, `getApplicationDetail`, `compareApplicationsForBody`, `appointApplicantToSeat`.
- `application-templates.functions.ts` — get/save base template.
- `jobs.functions.ts` — add supplemental question CRUD.
- `positions.functions.ts` — save default description/requirements.
- `volunteers.functions.ts`, `vendors.functions.ts` — full CRUD + intake + compliance.

**Routes**
- `/admin/application-template`
- `/admin-officials/applications/$id`
- `/admin-officials/applications/compare`
- `/volunteers`, `/vendors`
- `/serve/volunteer`, `/serve/vendor` (public)

**Reuse**
- `FormRunner` for all dynamic forms.
- Existing signed-URL pattern for file previews.
- Existing notification/email templates for appointment offers and compliance alerts.

## Scope note

This is a large plan spanning 5 major feature areas. I recommend implementing in the numbered order (1 → 5) so the officials page and board review work ship first, since those are the immediate blockers you mentioned. Let me know if you'd rather I split this into multiple approvals or reorder priorities.
