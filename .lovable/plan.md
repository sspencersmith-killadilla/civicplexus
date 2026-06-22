# Plan: Coaching UX, Grievance Workflow, and Full Hiring Suite

Three coordinated additions. All write paths log to `audit_events`. AI uses the existing `ai-gateway.server.ts`.

---

## 1. 1-on-1 Portal Restructure

**Goal:** notes attach to each agenda item, AI extracts actions from those notes, private notes live in a separate section below.

### Schema
- New `one_on_one_agenda_notes`: `session_id`, `agenda_index`, `agenda_prompt` (snapshot), `content`, `author_id`, timestamps. RLS = participants + HR.
- Keep `one_on_one_notes` but the bottom composer only writes `visibility='manager_private'`. Existing shared rows remain visible for history.

### UI (`one-on-ones.$id.tsx`)
- Agenda becomes an interactive list: each prompt = card with inline `Textarea` (autosaves on blur), plus a per-item "Extract actions" button.
- Below: a **Private notes** card (lock icon, manager-only) for free-form private thoughts.
- Top-right keeps "AI summary" (rolls up all agenda notes) and "Extract all actions".

### Server functions
- Update `extractOneOnOneActionItems` to read agenda notes (optional `agenda_index` to scope to one item).
- Update `summarizeOneOnOne` to compile context from agenda notes.

---

## 2. Grievance Workflow

### Schema
- `grievances`: add `acknowledged_at`, `due_date`, `outcome`, `appeal_deadline`.
- New `grievance_events` (immutable timeline): `grievance_id`, `actor_id`, `event_type`, `from_status`, `to_status`, `payload jsonb`. Populated by triggers on status/assignment changes.
- New `grievance_tasks`: investigation checklist (`title`, `assignee_id`, `due_date`, `status`).

### Status machine
`submitted → acknowledged → under_investigation → pending_resolution → resolved → closed`, with an `appealed` branch back to `under_investigation`.

### UI
- `grievances.index.tsx`: HR queue with status tabs + SLA badges (overdue past `due_date`).
- `grievances.$id.tsx`: Workflow panel (stepper, acknowledge, assign HR, due date), Investigation tab (tasks), Timeline tab (`grievance_events`), Resolution tab (outcome + summary, gated to assigned HR).
- Submitter view stays redacted (no investigation; status + shared notes + resolution only).

### Server functions
- `acknowledgeGrievance`, `assignGrievance`, `transitionGrievanceStatus`, `addGrievanceTask`, `resolveGrievance`, `appealGrievance`.

---

## 3. Hiring Suite — Requisitions, Public Board, ATS, Interviews, Internal Mobility

### A. Requisitions with multi-stage approval

**Schema**
- `job_requisitions`: `position_id` (nullable), `title`, `department`, `worker_type_id`, `location`, `employment_type`, `salary_min/max`, `summary`, `description`, `requirements`, `benefits`, `slug`, `status` (`draft / pending_approval / approved / posted / closed / filled`), `posted_at`, `closes_at`, `requested_by` (the hiring-manager/supervisor), `hiring_manager_id` (defaults to `requested_by`), `internal_only` (bool, for internal-mobility-only postings), `hire_request_id` (set when filled).
- `requisition_approvals`: `requisition_id`, `stage` (int), `approver_role` (`supervisor` / `hr_admin` / `department_head` / `finance`), `approver_id` (resolved at submit time, nullable until then), `status` (`pending / approved / rejected / skipped`), `decided_at`, `notes`. Multiple rows per requisition form the chain; the lowest-stage `pending` row is the active step.
- `approval_chain_templates` + `approval_chain_steps`: HR-configurable presets (default seed: Supervisor → HR Admin; option to add Department Head + Finance for salary > threshold). Org-wide defaults live in `org_settings`.

**Flow**
1. Hiring manager / supervisor drafts a requisition.
2. On submit, the server resolves each stage's `approver_id` (employee's manager chain + HR users with `hr_admin` role) and creates `requisition_approvals` rows.
3. Each approver sees a pending item in **Approvals** inbox + notification. Approve advances to next stage; reject ends the chain (requisition → `draft`, with `notes`).
4. When the final stage approves → status `approved`. HR can then `postRequisition` (auto-generates `slug`, sets `posted_at`).
5. Same chain pattern is reused for **hire requests** (see section D below) so finalists also flow through Supervisor → HR.

**Approvals inbox**
- New `src/routes/_authenticated/approvals.tsx` lists pending items (`requisition_approvals` + `hire_request_approvals`) assigned to current user, with approve/reject buttons.

### B. Public Job Board + Application Portal

**Schema**
- `job_applications`: `requisition_id`, `applicant_name`, `email`, `phone`, `resume_url`, `cover_letter`, `answers jsonb`, `source`, `status` (`new / screening / interview / offer / hired / rejected / withdrawn`), `rating`, `notes` (HR-only), `rejection_reason`, `is_internal` (bool), `internal_employee_id` (nullable, set for internal applicants), timestamps.
- `job_application_events`: timeline (status changes, notes, emails sent).
- Storage bucket `job-applications` (private).

**RLS**
- `job_requisitions`: HR/hiring_manager full; **public `TO anon` SELECT** only where `status='posted' AND internal_only=false`, projecting only public columns.
- `job_applications`: HR + assigned `hiring_manager_id` only. External inserts go through a public route, not direct PostgREST.

**Public routes (no auth)**
- `src/routes/careers.index.tsx` — list posted jobs.
- `src/routes/careers.$slug.tsx` — job detail + apply CTA.
- `src/routes/careers.$slug.apply.tsx` — application form (name, email, phone, resume upload, cover letter, screening answers, honeypot).
- `src/routes/api/public/job-applications.ts` — POST: Zod validation, IP rate-limit, mint signed storage upload URL, insert via `supabaseAdmin`, fire confirmation email + HR notification.

### C. Internal Mobility

- Authenticated route `src/routes/_authenticated/careers.index.tsx` lists **all** posted requisitions including `internal_only=true`, with an "Apply internally" button.
- Internal apply prefills name/email/employee record, sets `is_internal=true` and `internal_employee_id`. Current manager is auto-notified (visibility flag `notify_current_manager` on the application form lets the employee opt-out for confidential applications).
- HR view shows internal applicants with a badge and a sidebar of their current role, tenure, and last review rating.
- "Convert to internal transfer" outcome (instead of new hire) — creates a `position_change` audit event on the employee record and flips their `position_id` after the start date.

### D. ATS, Interviews, and Hire Requests

**Hiring manager = supervisor by default.** The requisition's `hiring_manager_id` defaults to `requested_by` but HR can reassign. Only the hiring manager and HR see/manage applications.

**Schema**
- `interviews`: `application_id`, `scheduled_at`, `duration_minutes`, `location` (or video link), `interviewer_ids uuid[]`, `stage` (`phone_screen / first_round / panel / final`), `status` (`scheduled / completed / cancelled / no_show`), `scorecard_template_id`, `calendar_event_id` (external), timestamps.
- `interview_feedback`: `interview_id`, `interviewer_id`, `rating` (1–5), `recommendation` (`strong_hire / hire / no_hire / strong_no_hire`), `notes`, submitted_at.
- `hire_request_approvals`: mirrors `requisition_approvals` so hire requests use the same multi-stage chain. Tied to `hire_requests.id`.

**Flow**
1. HR/hiring manager moves an application to `screening` → `interview`. Clicking "Schedule interview" opens a dialog: date/time, interviewers (autocomplete employees), location/video link, stage.
2. On save, server function `scheduleInterview`:
   - Creates `interviews` row.
   - If Google Calendar connector is linked (see Calendar section), creates a calendar event with attendees and stores `calendar_event_id`.
   - Sends "Interview scheduled" email to applicant + ICS attachment; notifies interviewers in-app.
3. Each interviewer submits a scorecard via `src/routes/_authenticated/interviews.$id.tsx` after the meeting.
4. Hiring manager clicks **"Make hire request"** on the application detail. This calls `convertApplicationToHire`:
   - Calls existing `create_hire_request` RPC with prefilled fields (worker type, salary, start date editable).
   - Creates a parallel `hire_request_approvals` chain (default: Supervisor → HR Admin; HR can extend).
   - Each approver gets an Approvals inbox item + notification.
5. When final approval lands → calls existing `decide_hire_request('activate')` flow, which kicks off onboarding template + provisioning. Application status → `hired`. Requisition status → `filled`.

### E. Applicant Notifications

**Channels**
- Email (transactional) via Resend connector (`standard_connectors--connect` with `resend`). If user prefers another provider, ask before linking.
- In-app notifications for internal applicants via existing `notifications` table.

**Triggers** (each sends a templated email, logged to `job_application_events`):
- Application received (auto on submit).
- Status changed to `screening` / `interview` / `offer` / `rejected` / `hired`.
- Interview scheduled / rescheduled / cancelled (with ICS).
- Offer extended (links to e-sign placeholder for future).
- Manual "send message" from HR with free-form body.

**Template store**
- `email_templates` (key, subject, body markdown, locale). Seeded with defaults; HR can edit in `src/routes/_authenticated/email-templates.tsx`.

**Implementation**
- `src/lib/applicant-emails.functions.ts` exposes `sendApplicantEmail` (server fn, uses Resend API + workspace "from" address from `org_settings`).

### F. Calendar Integration

**Approach:** Google Calendar connector (workspace-owned) for the v1, so HR/hiring managers create events from the org's shared calendar account.

**Setup**
- `standard_connectors--connect` with `google_calendar`. Confirm with user before linking — explain it uses one workspace Google account (not per-user OAuth) and that for per-interviewer calendars we'd need a follow-up per-user OAuth implementation.
- Store the "scheduling calendar id" in `org_settings.scheduling_calendar_id`.

**Server functions** (`src/lib/calendar.functions.ts`)
- `createCalendarEvent`, `updateCalendarEvent`, `cancelCalendarEvent` — call gateway `https://connector-gateway.lovable.dev/google_calendar/calendar/v3/...`.
- On any failure, the interview row still saves; UI shows "Calendar sync failed — retry" with a retry button. ICS attachment in the applicant email is always generated locally so the candidate has a fallback invite.

**Fallback when no calendar is connected:** interview rows still get created; the applicant gets an ICS attachment via email; interviewers get in-app notifications only.

### G. Admin Surfaces

- `src/routes/_authenticated/jobs.index.tsx` — requisition list with status filters, "New requisition" dialog, approval-chain badge.
- `src/routes/_authenticated/jobs.$id.tsx` — tabs: Posting (markdown editor + public preview link), Approvals (chain progress), Applications (kanban), Activity.
- `src/routes/_authenticated/jobs.$id.applications.$appId.tsx` — applicant detail: resume viewer, scorecards, interview history, status transitions, "Schedule interview", "Make hire request", "Send message".
- `src/routes/_authenticated/interviews.$id.tsx` — interview detail + scorecard.
- `src/routes/_authenticated/approvals.tsx` — unified approvals inbox.
- `src/routes/_authenticated/email-templates.tsx` — template editor.
- Nav: add **Hiring** section to `app-shell.tsx` (Requisitions, Applications, Approvals, Interviews, Internal Careers).

---

## Technical Details

- Migrations split per concern, all follow CREATE → GRANT → RLS → POLICY.
- `tg_set_updated_at` triggers on every new table.
- Approval chain resolution lives in a `resolve_approval_chain(_requisition_id)` SQL function so the same logic is reused by requisitions and hire requests.
- Calendar + email calls are best-effort; failures don't block the state machine and surface as retry actions.
- Public job-board pages use a server publishable Supabase client inside loaders — no service role on public routes.
- AI: `summarizeApplication` (fit summary from resume + cover letter + answers); reuses `google/gemini-3-flash-preview`.

## Secrets/connectors to confirm before build

1. **Resend** for applicant emails — needs `standard_connectors--connect` with `resend` and a verified "from" address.
2. **Google Calendar** for interview events — needs `standard_connectors--connect` with `google_calendar`. Workspace-owned account, not per-user.

If either is declined, the system degrades gracefully (in-app notifications + ICS attachments only).

## Out of scope

- Per-user OAuth Google Calendar (each interviewer's personal calendar).
- Offer letter e-signature workflow (status `offer` exists but signing is stubbed).
- Salary band enforcement and budget integration.
- Job board SEO sitemap, recommendation engine, referrals program.
- SMS notifications.
