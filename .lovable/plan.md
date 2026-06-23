## Recruiting & Onboarding — completing the loop

The skeleton (requisitions, careers site, applications, interviews, screenings, hire requests, preboarding tasks) is already in place. The flow breaks down in four spots: there is no formal **offer** step, external candidates have **no portal** after applying, **applicant communications** are barebones, and **onboarding** doesn't automatically advance state or surface progress to managers. This plan closes those four gaps and adds the municipal-grade reporting expected of an HRIS.

### 1. Offer management (new)

```text
application (finalist) ─► offer (draft → sent → accepted/declined/expired) ─► hire_request
```

- New `offers` table: `application_id`, `salary`, `pay_grade`, `start_date`, `expires_at`, `letter_html`, `status`, `sent_at`, `signed_at`, `signature_id`, `decline_reason`.
- Offer letter generated from a configurable template (org_settings) with variable substitution (name, title, salary, start date, supervisor).
- Hiring manager drafts → HR approves → emailed to candidate with a secure tokenized accept/decline link (no auth required, signed JWT).
- Accept captures e-signature (reuse `signatures` table), then auto-calls `convertApplicationToHire`. Decline records reason and reopens the requisition.
- Reject path also generates a templated rejection email for any application not advanced.

### 2. Candidate portal (new)

A tokenized public route `/candidate/$token` (no login) where each external applicant can:

- See current stage (Submitted / Screening / Interview / Offer / Closed).
- View scheduled interview details (time, location, interviewer names, video link).
- Upload requested documents (resume update, references, work samples) into `job-applications` bucket.
- Accept/decline interview times and offers.
- Read messages from recruiter and reply (stored in `application_messages` table).

Tokens minted per application (HMAC-signed, expirable, revocable), verified in a `/api/public/candidate/*` route family.

### 3. Applicant communications

- `email_templates` table seeded with: application received, screening invite, interview confirmation, interview reminder (24h), offer extended, offer reminder, rejection (with EEO-compliant language), and welcome (post-hire).
- `applicant-emails.functions.ts` extended with `sendTemplated(template_key, application_id)` that pulls variables from the application/requisition.
- Auto-triggers: acknowledge on apply, reminder 24h before interview (cron), follow-up if no offer response in 5 days.
- All sends logged to `job_application_events` so the application timeline shows every touchpoint.

### 4. Onboarding closeout & manager visibility

- Trigger `tg_onboarding_progress`: when all `is_required` task_instances for an instance reach `complete` AND `employees.start_date <= today`, flip `employees.status` from `preboarding` → `active` and emit a notification to the supervisor.
- "My Team — New Hires" panel on the supervisor dashboard: per-direct-report progress bar, blocked tasks, days-until-start.
- Welcome day-one schedule auto-generated from a configurable template (org_settings.day_one_agenda): orientation slot, IT pickup, benefits intro — written as `task_instances` with due_at = start_date.
- Surface provisioning request status (equipment, accounts) inside preboarding so the new hire knows what's coming.
- Auto-issue PPE sizing form to new hires whose worker_type requires it.

### 5. Municipal compliance reports (Reports tab additions)

- **Applicant flow log** (EEO-4 / EEOC) — applications by job category × gender × race × veteran status × disability with voluntary self-id collected on the public apply form (separate table, never shown to hiring managers).
- **Time-to-fill** by department and requisition (posted → hired in days).
- **Source-of-hire** breakdown.
- **Offer acceptance rate** and **decline reasons**.
- All exportable as CSV.

### Technical details

**Migrations**
- `offers` table + RLS (HR + hiring manager + assigned recruiter can manage; candidate accesses via token route only, so no anon policy needed).
- `application_messages` table (RLS: HR/hiring manager full; candidates by token via server route).
- `application_self_id` table (RLS: insert-only by candidate token; read restricted to `hr_admin` for aggregate reports; no manager access).
- `email_templates` table (HR-admin managed).
- `candidate_tokens` table (`application_id`, `token_hash`, `expires_at`, `revoked_at`).
- Trigger `tg_onboarding_progress` on `task_instances` AFTER UPDATE.
- Storage: add `offer-letters` bucket (private, signed URLs).

**Server functions** (`src/lib/`)
- `offers.functions.ts`: `createOffer`, `sendOffer`, `getOfferByToken`, `respondToOffer`, `voidOffer`.
- `candidate-portal.functions.ts`: `getApplicationByToken`, `postCandidateMessage`, `uploadCandidateDocument`, `confirmInterviewTime`.
- `email-templates.functions.ts`: CRUD plus `sendTemplated`.
- `reports.functions.ts`: `applicantFlowLog`, `timeToFill`, `sourceOfHire`, `offerStats`.
- Extend `dispatchTrainingReminders` cron route to also dispatch interview reminders, offer expirations, and welcome-day prep.

**Public routes** (`src/routes/api/public/`)
- `candidate/$token/status.ts`, `candidate/$token/message.ts`, `candidate/$token/document.ts`
- `offers/$token/view.ts`, `offers/$token/respond.ts`

**UI**
- `_authenticated/offers.index.tsx`, `_authenticated/offers.$id.tsx`
- `_authenticated/applications.$id.tsx` — unified application timeline (events + messages + interviews + offers + emails).
- `_authenticated/email-templates.tsx`
- Extend `reports.tsx` with the four new municipal reports.
- Extend `preboarding.tsx` and `dashboard.tsx` with the manager/new-hire panels.
- Public `/candidate/$token.tsx` and `/offer/$token.tsx` (top-level, no auth).
- Add voluntary self-id step to `careers.$slug.apply.tsx` (optional, EEO-mandated language).

**Out of scope** (call out, don't build): SMS notifications, video interview hosting, AI resume screening, integration with external job boards (Indeed/LinkedIn), assessment platforms, e-verify automation.

### Acceptance checks
- A finalist application can be moved through Offer → Accepted → Hire Request → Active employee with no manual data re-entry.
- An external candidate can complete the entire journey (apply → schedule → accept offer → first day) without ever creating an account.
- A new hire's required onboarding tasks completing flips status to `active` and notifies their supervisor.
- HR can generate an EEO-4 applicant flow log for any date range as a CSV.