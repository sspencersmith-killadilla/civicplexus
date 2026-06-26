# CivicPlexus User Guide

Welcome to **CivicPlexus**, the HRIS built for city and county government. This guide walks every role — Admins, HR, Hiring Managers, Supervisors, IT, and Employees — through first-time setup and daily operations. No technical background required.

CivicPlexus is one system from req to retire: recruiting, onboarding, core HR & records, payroll & benefits, performance & development, and public-sector compliance (FLSA, EEO‑4, TCOLE, TMRS, FMLA, new‑hire reporting). Onboarding is one module of many.

> Screenshots referenced as `![placeholder]` are intentionally blank. Drop your own PNGs into `docs/img/` before printing or sharing.

---

## 1. Concepts at a glance

| Term | What it means |
| --- | --- |
| **Worker Type** | A category of hire (Office, Field, Public Safety, Volunteer, etc.) that drives which workflows run. |
| **Position** | A budgeted seat in the org with title, grade, FLSA class, and reporting line. |
| **Requisition** | A posted job opening tied to a position. Can be internal-only or public. |
| **Application** | A candidate's submission against a requisition; tracked through screenings, interviews, and an offer. |
| **Offer** | A signed offer letter delivered to a candidate via a tokenized portal. |
| **Hire Request** | A supervisor's request to bring on a new worker; HR approves it to start onboarding. |
| **Onboarding Instance** | The full checklist running for one employee, created automatically from a template. |
| **Template / Task Instance** | Reusable checklist of tasks and the per-employee copy generated from it. |
| **Form Definition / Submission** | A fillable form (I-9, W-4, etc.) and the data a person submits. |
| **Signature** | An e-signature captured for a form, document, policy, or review. |
| **Document / Doc Template** | A stored file and the merge template used to generate one. |
| **PAF (Personnel Action Form)** | A change request (promotion, transfer, pay change, separation) routed through an approval chain. |
| **Pay Grade / Market Range** | Salary structure: grade with min/mid/max and an external market benchmark. |
| **Comp Cycle** | A budgeted round of merit + market increases with manager recommendations and calibration. |
| **Employee Comp** | The history of base-pay records for one employee, with effective dates. |
| **Pay Calendar / Group / Period / Run** | Payroll plumbing: schedule, who's in it, the period being paid, and the run that exports it. |
| **Performance Review / Review Cycle** | A self + manager assessment and the company-wide cycle that opens them. |
| **Goal / Cascade** | Individual or team objectives, optionally cascaded from a parent goal. |
| **1:1** | A scheduled manager–employee meeting with agenda, notes, and action items. |
| **Policy / Campaign / Acknowledgment** | A published policy, the campaign that pushes it out, and the signed confirmation. |
| **Screening** | Background, fingerprint, drug, MVR, or credit check. |
| **Course / Employee Training / Certification** | A training course, an assignment to an employee, and the credential that results. |
| **Grievance** | A formal complaint case with intake, tasks, events, and resolution. |
| **FMLA Case** | A leave-of-absence case tracked against federal/state entitlements. |
| **TCOLE Licence** | Texas peace-officer licensing record and continuing-education completions. |
| **TMRS Enrollment** | Texas Municipal Retirement System enrollment and monthly file lines. |
| **Provisioning Request** | An IT ticket for accounts, badges, hardware, or system access. |
| **Audit Event** | An immutable record of who did what, when. |

---

## 2. First-time setup (Admin — do this once)

### 2.1 Claim the admin role
1. Visit the app, click **Create account**, sign up with your work email.
2. The first signup defaults to the `candidate` role. Promote yourself by running this SQL in the database SQL editor (Lovable Cloud users: **Cloud → Database → SQL editor**; self-hosters: Supabase Studio → SQL):
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'hr_admin' FROM auth.users WHERE email = 'you@city.gov';
   ```
3. Sign out and back in. You should now see **People**, **Recruiting**, **Pay**, **Performance**, **Compliance**, and **Admin** groups in the sidebar.

### 2.2 Configure the organization (Admin → Settings)
- **Org profile**: name, EIN, mailing address, phone.
- **Branding**: primary + accent colors (writes to CSS variables, applies on next reload).
- **Retention policy** (JSON): how long to keep each document kind. Sample:
  ```json
  { "i9": 3, "w4": 4, "policy_ack": 7, "screening": 5, "training_cert": 7, "payroll": 7 }
  ```
- **Email sender**: `EMAIL_FROM` address and verified domain (see Self-Hosting Guide §9).
- **SSO metadata URL**: paste your Entra/Okta SAML metadata URL. Apply via support after saving.
- **Google auth**: enable in Cloud → Auth → Providers if you want one-click sign-in.

### 2.3 Invite your team
Ask each teammate to sign up, then assign their role:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'hiring_manager' FROM auth.users WHERE email = 'manager@city.gov';
```
Valid roles: `hr_admin`, `hiring_manager`, `supervisor`, `it_admin`, `manager`, `employee`, `candidate`.

### 2.4 Set up payroll plumbing (HR + Finance)
1. **Pay Calendars** — define your pay frequency (weekly, biweekly, semimonthly, monthly) and period boundaries.
2. **Pay Groups** — group employees by who they're paid alongside (e.g., General, Police, Fire, Council).
3. **Pay Periods** — auto-generated from each calendar; verify the next 12 months look correct.
4. **Payroll Export Profiles** — pick the format your provider expects (CSV columns, fixed-width, etc.).

### 2.5 Set up the salary structure
1. **Comp Grades** — create grades with min / mid / max.
2. **Comp Market** — import or paste market ranges per grade per benchmark source.
3. **Positions** — assign every position a grade and an FLSA class (exempt / non-exempt).

### 2.6 Review seeded worker types and templates
1. **Worker Types** — confirm the list matches what your municipality hires (Office/Admin, Field Staff, Public Safety, Temporary/Seasonal, Contractor/Vendor, Volunteer, Elected/Appointee).
2. **Templates** — every worker type ships with a default onboarding template covering I-9, W-4, OSHA, fingerprinting, DOT/CDL, equipment, training, and provisioning as relevant.
3. To customize: open a template, **Clone**, edit task list, set `due_offset_days` and assignee role (`employee`, `hr`, `manager`, `it`), then **Publish**.

---

## 3. Recruit & Hire (ATS)

### 3.1 Hire requests
Supervisors and hiring managers file a **Hire Request** with proposed name, title, department, worker type, start date, and the provisioning kinds the new hire will need. HR reviews and either **Activates** (starts onboarding) or **Rejects** (cleans up the draft employee).

### 3.2 Requisitions and the careers site
- **Jobs → New Requisition**: title, department, position, pay range, posting copy, internal-only flag.
- Posted requisitions show up on the **Careers** page (`/careers`) and, for internal candidates, on **Internal Careers**.
- Applications come in through `/careers/<slug>/apply`. Resumes are uploaded to private storage; PDF resumes are parsed for HR search.

### 3.3 Screenings, interviews, offers
- **Screenings** — order background / fingerprint / drug / MVR / credit checks, attach results when they come back.
- **Interviews** — schedule, capture **Interview Feedback** from each panelist with a structured rubric.
- **Offers** — generate from a doc template, send via the tokenized **Offer Portal** (`/offer/<token>`). Candidate accepts or declines online; HR is notified.
- **Candidate messaging** — send and receive messages from the candidate portal (`/candidate/<token>`) without sharing email threads.

### 3.4 Voluntary self-identification
Public applications include EEO self-ID (gender, race/ethnicity, veteran status, disability) — fully optional, encrypted at rest, only visible in aggregated EEO reports.

---

## 4. Onboard & Provision

### 4.1 Add an employee
1. **Employees → New Employee** (or approve a Hire Request).
2. Enter name, email, start date, department, worker type, position.
3. The system creates an **Onboarding Instance** and generates every task from the worker type's default template. Email the preboarding link.

### 4.2 Preboarding portal (employee view)
The new hire signs in and sees their checklist: forms to fill, documents to upload, policies to sign, training to complete. Progress percentage updates live.

### 4.3 Forms library and signatures
- Build forms in **Forms Library**. Each form has a `key` (used by template tasks), a JSON schema, and an optional signature requirement.
- Signed submissions write to **Signatures** with timestamp + signer name (E-SIGN compliant).

### 4.4 Documents
- Reviewers see uploads in **Documents** with status (Pending, Approved, Rejected) and a preview pane.
- Approve, reject with reason, or request re-upload. All actions write to **Audit Log**.

### 4.5 Doc templates and generation
- **Doc Templates** holds merge templates (offer letters, PAFs, separation letters, certificates).
- **Docs Generator** renders a template against an employee + variables and stores the resulting PDF in **Documents**.

### 4.6 IT provisioning
- **IT Provisioning** is a kanban: Requested → In Progress → Completed → Rejected.
- Auto-populated from template tasks tagged `provisioning` (email account, badge, laptop, software licenses, system access).

### 4.7 Equipment & PPE
- Maintain the **Equipment Catalog** (SKU, sizes, cost center).
- Capture **PPE sizing** per employee.
- Track **Issuance** with issued/returned dates and condition.

### 4.8 New-hire batches and reporting
- **New Hire Batches** groups onboardings for orientation cohorts.
- **New Hire Reports** queues each activation for state new-hire reporting (TWC in Texas) and lets you export the file.

---

## 5. Core HR & Records

### 5.1 Employees
The central record: contact info, employment status, manager, position, worker type, dates, sensitive identifiers (encrypted), and links to every other module.

### 5.2 Positions
Budgeted seats with title, department, grade, FLSA class, reports-to. Vacancies are visible to recruiting.

### 5.3 Personnel Action Forms (PAFs)
- **PAF → New**: pick the action type (promotion, transfer, pay change, status change, separation), the employee, and the effective date.
- The PAF runs through an **Approval Chain** (stages with role-based approvers); each step is auditable.
- On final approval, the underlying employee/position/comp record updates.

### 5.4 My HR (self-service)
Employees see their own profile, paystubs, documents, time-off balance, assigned training, pending policies, and PAFs that affect them.

---

## 6. Pay & Benefits

### 6.1 Comp cycles
1. **Comp Cycles → New**: name, period, budget %, eligibility filter (departments, worker types).
2. Opening the cycle seeds every eligible employee with a recommended merit % derived from their latest review rating.
3. Managers enter recommendations; HR runs **Calibration** (distribution by department, rating, gender pay-gap check).
4. Approve → writes new `employee_comp` rows with the effective date.

### 6.2 Payroll runs
1. **Payroll → New Run**: pick the pay period and pay group.
2. The system pulls each employee's current `employee_comp`, hours, and one-time pay items into **Payroll Run Lines**.
3. Review, lock, and **Export** using your configured profile. The file lands in the `payroll-exports` storage bucket.

### 6.3 Benefits hand-off
- Mark eligibility, set enrollment window, attach **Dependents** (DOB, SSN, relationship).
- Generate a hand-off packet for the carrier; carrier callbacks land at `/api/public/hooks/benefits-callback` (HMAC-signed).

---

## 7. Perform & Develop

### 7.1 Goals and cascades
- **Goals**: individual objectives with progress, weight, due date, and optional parent goal. Progress on children rolls up to the parent automatically.
- **Cascades**: top-down objective trees (e.g., City Manager → Department → Division → Individual).

### 7.2 Review cycles
1. **Review Cycles → New**: period, eligibility, template, due dates for self / manager / signature.
2. Opening the cycle creates **Performance Reviews** for every eligible employee and notifies them and their manager.
3. **Calibration** view lets HR compare ratings across departments and surface outliers; rating changes are logged.
4. Both parties sign; finalized reviews lock and feed the next comp cycle.

### 7.3 1:1s
Manager and report share an agenda template, take running notes (private and shared), and capture action items that surface on each other's home pages until done.

### 7.4 Training & certifications
- Assign **Courses** (one-off or recurring) to employees or to whole worker types.
- **Employee Training** tracks status, score, evidence upload, and completion.
- Completing a course can issue a **Certification** with an expiry; **Expiry tracker** color-codes 30/60/90 days out.
- **Transcript** prints a full per-employee training history.

---

## 8. Comply & Govern

### 8.1 Policies
- **Policies** page: create with title, body (Markdown supported), effective date, and re-acknowledgment cadence in months.
- Publishing a new version triggers a re-ack **Policy Campaign** for everyone who previously signed.
- Scroll-to-bottom is required before the signature pad activates.

### 8.2 FLSA audit
- **FLSA Audit** lists every position with current exemption class, the last duties-test review, and whether a re-review is due.
- Record a review with decision (exempt / non-exempt / needs review), exemption basis, duties notes, and next review date.

### 8.3 EEO snapshot
- **EEO Snapshot** generates a workforce snapshot as of a chosen date, broken down by department and full-time / part-time. Use it to build EEO-4 filings.

### 8.4 TCOLE (Texas peace officers)
- **TCOLE Licences** stores PID, licence number, level, issue/expiry.
- **TCOLE Completions** tracks continuing-education hours by reporting cycle.

### 8.5 TMRS (Texas Municipal Retirement)
- **TMRS Enrollments** captures plan, contribution %, vesting.
- **TMRS Monthly Files** generates the upload TMRS expects each period.

### 8.6 FMLA cases
Track each leave-of-absence case: dates, hours used vs entitlement, certification status, intermittent vs continuous, return-to-work date.

### 8.7 Grievances
- **Grievances → New**: intake form captures complainant, respondent, category, narrative, and confidentiality preference.
- HR assigns an investigator; **Grievance Tasks** drive the investigation; **Grievance Events** are a full audit timeline.
- Resolution sets the outcome and notifies the parties.

### 8.8 Audit log
Filter by actor, entity, date range. Read-only. Retain forever; never delete.

### 8.9 Reports
Pre-built reports: time-to-hire, time-to-fill, headcount by department, turnover, training compliance %, policy ack %, I-9 compliance %, payroll variance. Every report has an **Export CSV** button.

---

## 9. Roles & permissions

| Role | Sees | Can do |
| --- | --- | --- |
| `hr_admin` | Everything | Configure org, approve PAFs, run cycles, export payroll, manage roles |
| `hiring_manager` | Their reqs + applicants | Post reqs, screen, interview, request offers |
| `supervisor` | Their team | File hire requests, complete reviews, approve timecards |
| `manager` | Their team | Same as supervisor for performance, no hire requests |
| `it_admin` | Provisioning queue + equipment | Fulfil provisioning, manage equipment catalog |
| `employee` | Their own record | Self-service: profile, docs, training, policies, leave |
| `candidate` | Their application + offer | Apply, message recruiter, accept offers |

Roles live in `public.user_roles`. The `private.has_role(uid, role)` security-definer function backs every RLS policy.

---

## 10. Operating cadence

| Cadence | Action |
| --- | --- |
| Daily | Check overdue tasks, screening clearances, interview feedback gaps, application inbox. |
| Weekly | Open-onboardings report, cert expirations, policy ack progress, recruiting funnel. |
| Each pay period | Lock and export payroll; reconcile exceptions with Finance. |
| Monthly | Audit-log spot check, retention sweep, TMRS file upload, new-hire report file. |
| Per review cycle | Self-assessments → manager reviews → calibration → finalize → feed comp cycle. |
| Per comp cycle | Manager recommendations → calibration → approval → effective-date write. |
| Quarterly | Access review (remove stale admin accounts), backup-restore drill, FLSA review queue. |
| Annually | EEO-4 snapshot, TCOLE cycle close, policy re-ack sweep, doc retention audit. |

---

## 11. Notifications
- **In-app bell** shows unread count.
- Email delivery uses your configured Resend / SES / SendGrid domain (see Self-Hosting Guide §9).
- Overdue reminders fire daily via `pg_cron` hitting `/api/public/hooks/reminders` with a shared secret.

---

## 12. Offboarding & rehire
1. **Offboarding → New Separation**. Pick employee, last day, reason.
2. The system runs the offboarding template: equipment return, access revocation, COBRA notice, final pay, exit interview.
3. Mark `rehire_eligible` true/false.
4. To rehire: open the former record, **Clone Onboarding**, optionally skip tasks completed before.

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| New hire never got the email | Email domain unverified | Re-check DNS records in your email provider |
| "Unauthorized" on a server action | Bearer attacher misconfigured | Verify `src/start.ts` registers `attachSupabaseAuth` |
| Sidebar empty after sign-in | Missing role assignment | Run the `user_roles` INSERT in §2.3 |
| Policies never appear for employees | Policy not published, or effective date in future | Set `effective_date <= today` and **Publish** |
| Reminders not firing | `pg_cron` job disabled or secret mismatch | Re-enable cron; resync `REMINDERS_CRON_SECRET` |
| Payroll export missing rows | Employee outside the pay group, or no `employee_comp` row | Add to group, backfill comp |
| Comp cycle shows nobody | Eligibility filter excludes everyone | Loosen the filter, re-open the cycle |
| Review cycle didn't seed | No active employees in scope, or cycle never moved to `open` | Activate employees, set status `open` |
| `permission denied for table X` | Missing GRANT in a migration | `GRANT SELECT, INSERT, UPDATE, DELETE ON public.X TO authenticated;` |

### Support escalation template
```
Subject: CivicPlexus issue — <one-line summary>
Environment: <production / staging>
User affected: <email + role>
What I expected: ...
What happened: ...
Steps to reproduce: 1) ... 2) ...
Audit log timestamp: <UTC>
Screenshot: attached
```

---

## 14. Appendix

### Accessibility
- All interactive elements are keyboard-reachable. `Tab` cycles, `Enter`/`Space` activates.
- Color contrast meets WCAG 2.1 AA.
- Forms support screen readers; labels are always present.

### Mobile
The app is responsive down to 360px. Field crews and new hires can complete preboarding, sign policies, and submit time on a phone.

### Glossary
See §1.

---

## 15. Demo Walkthrough

Sign in as `demo.purpose@testingaccount.test` (password `Demo, 1234`). A banner appears with a 24-hour countdown and a "Start tour" launcher. Every change you make is reverted automatically when the timer hits zero, or immediately via **Reset now**.

The guided tour mirrors the in-app overlay. Each stop names the route, what to look at, and an optional "Try this" action.

1. **Dashboard** (`/dashboard`) — KPIs, recent activity, and pending approvals. *Try:* scan the cards to see live counts from seeded demo data.
2. **Employees** (`/employees`) — directory with org, status, and supervisor chain. *Try:* open any employee for their full record, leave, and assignments.
3. **Employee profile** (`/employees/{id}`) — full record, contact info, photo, transcript link, and HR-only ID badge controls. *Try:* HR can upload a photo, pick a template, and click **Generate badge PDF** to print a CR80 badge.
4. **Org Chart** (`/org-chart`) — photo-driven hierarchy from `manager_id`, color-coded by department, with search, zoom, print, and PNG export. *Try:* filter by department and download a PNG.
5. **Hire Requests** (`/hire-requests`) — requisition lifecycle draft → approval → posted. *Try:* the "Use template" wizard spins up a Library Aide req in seconds.
6. **Approvals Inbox** (`/approvals`) — every PAF, hire request, and offer awaiting sign-off. *Try:* approve, return, or comment on the seeded PAF.
7. **Personnel Action Forms** (`/paf`) — promotions, transfers, separations with full audit trail. *Try:* click **New PAF** to walk an action through the chain.
8. **Recruiting — Postings** (`/jobs`) — public and internal postings backed by approved requisitions. *Try:* open a posting and use the public **Apply** link to test the candidate flow.
9. **AI Applicant Screening** (`/screenings`) — human-in-the-loop: AI drafts a fit score, recruiters Accept / Edit / Dismiss. *Try:* select multiple applicants and run a bulk screening pass.
10. **Offers** (`/offers`) — generated offer letters with signed candidate response tokens. *Try:* open a pending offer and preview the candidate-facing page.
11. **Preboarding & Onboarding** (`/preboarding`) — task lists, equipment, and provisioning for new hires.
12. **Offboarding** (`/offboarding`) — separation checklist with role-aware task templates. *Try:* start an offboarding from any employee to see the generated tasks.
13. **Performance — Review Cycles** (`/review-cycles`) — configure cycles, participants, and calibration sessions.
14. **1-on-1s** (`/one-on-ones`) — templates and meeting notes for manager/employee conversations. *Try:* open a meeting to see the role-aware question set.
15. **Goals & OKRs** (`/goals`) — employee and team goals tied back to review cycles.
16. **Compensation Cycles** (`/comp-cycles`) — run merit and market adjustment cycles with proposals and FLSA checks.
17. **Policies & Acknowledgements** (`/policies`) — policy library and acknowledgement campaigns.
18. **Training & Transcripts** (`/training`) — course catalog, assignments, and individual transcripts.
19. **Compliance — TCOLE / TMRS** (`/compliance/tcole`) — Texas-specific reporting surfaces.
20. **Reports & EEO** (`/reports`) — headcount, turnover, comp-ratio, EEO snapshot.
21. **ID Badge Templates** (`/id-badge-templates`) — design CR80 badges: fields, colors, default template, public QR verification.
22. **Module Settings** (`/admin-modules`) — super-admin toggles to turn entire modules on or off per tenant.
23. **Demo Admin** (`/admin-demo`) — provision the demo account and reset its data on demand. *Try:* click **Reset now** to revert immediately.

### Employee photos & ID badges
- HR uploads to a private storage bucket; signed URLs render the photo throughout the app (profile, org chart, badge PDF).
- Employees cannot replace their own photo — HR-only by RLS and server checks.
- Badge PDFs render at CR80 size (3.375" × 2.125") with a QR code that resolves to `/api/public/badge/{serial}` for at-a-door verification.
- Revoking a badge flips its public verify page to **Revoked** immediately.

### Org chart
- Built live from `employees.manager_id`; no separate hierarchy table to maintain.
- Active employees only by default — toggle **Include inactive** to audit gaps.
- The **Unassigned** panel lists active employees with no manager and no reports — useful for cleaning up reporting lines.

### Reset behavior
- A `pg_cron` job runs hourly and rolls back any rows the demo user inserted, updated, or deleted in the last 24 hours.
- **Reset now** on `/admin-demo` triggers the same rollback immediately.
- Module toggles, security settings, and other super-admin surfaces are out of scope for the demo sandbox revert.