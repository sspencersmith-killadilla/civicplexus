# CivicPlexus — End User Guide

A step-by-step reference for every module, organized by who does what. Find your role, find the module, follow the steps.

## How to use this guide

Each module chapter lists:

- **What it is** — one-sentence summary.
- **Who can use it** — role badges.
- **Where to find it** — sidebar path.
- **Workflows** — numbered steps per role.
- **Tips & gotchas** — common pitfalls.

### Role legend

- 👤 **Employee** — any signed-in staff member.
- 👥 **Supervisor** — anyone with direct reports (also called "manager").
- 🎯 **Hiring Manager / Recruiter** — owns requisitions, applicants, interviews, offers.
- 🧑‍💼 **HR Admin** — full people, PAF, comp, compliance, and payroll access.
- 💵 **Payroll** — runs payroll cycles and exports.
- 🛡️ **Super Admin** — org settings, module toggles, identity, migrations.

### Getting around

- **Sign in** at `/auth`. If SSO is enabled, use your work identity provider.
- **Sidebar** groups modules (Overview, People, Time & Leave, etc.). Click a group header to expand or collapse.
- **Collapse the sidebar** with the chevron button (icon-only mode); state persists per browser.
- **Mobile**: tap the hamburger button (top-left) to open the sidebar sheet.
- **Search the directory** at `/directory` — open to everyone.
- **Notifications** live at the bell icon and at `/notifications`.
- **Offline PWA**: install the app from your browser's "Install app" prompt. Clock punches, leave requests, and approvals queue offline and sync when you're back online.

---

## Dashboard

**What** — Landing page with your open tasks, approvals, and recent activity.
**Who** — 👤 👥 🎯 🧑‍💼
**Where** — Sidebar → Overview → **Dashboard**

### 👤 Employee

1. Review "My open tasks" (forms to sign, training due, timecards to submit).
2. Click any card to jump straight to the task.

### 👥 Supervisor

1. Check "Awaiting my approval" for leave, timecards, PAFs.
2. Use the "My team" widget to open a report's profile.

### 🧑‍💼 HR Admin

1. Scan org-wide KPIs (headcount, open reqs, pending approvals).
2. Click through to the source module to act.

---

## My HR

**What** — Your personal HR home: profile summary, supervisor, direct reports, and upcoming celebrations (birthdays, anniversaries).
**Who** — 👤 👥 🧑‍💼
**Where** — Sidebar → Overview → **My HR**

### 👤 Employee

1. Confirm your photo, title, department, and contact details are correct.
2. If any personal info is wrong, message HR — sensitive fields (DOB, personal email, comp) are HR-editable only.
3. Use the supervisor card to open your manager's profile.

### 👥 Supervisor

1. Scroll to **My Team** for a photo grid of direct reports.
2. **Upcoming celebrations** shows birthdays and work anniversaries for the next 30 days.
3. Click any report to open their profile.

---

## Directory

**What** — Searchable, org-wide staff directory.
**Who** — 👤 👥 🎯 🧑‍💼 🛡️
**Where** — Sidebar → Overview → **Directory**

### Everyone

1. Type a name, title, or department in the search bar.
2. Filter by department or employment status.
3. Click a card to open the person's profile. Sensitive fields are hidden unless you're HR, their manager, or the employee themselves.

---

## Org Chart

**What** — Visual reporting tree with department color-coding and photos.
**Who** — 👤 👥 🎯 🧑‍💼
**Where** — Sidebar → People → **Org Chart**

1. Use the **Department** filter to focus on one team.
2. Click a node to open the employee profile.
3. Zoom and pan with the scroll wheel or trackpad.

**Gotcha** — If someone appears in the wrong branch, HR needs to update their `manager_id` on the employee record (a PAF is the audited way to do this).

---

## Employees

**What** — Full employee records: identity, employment, compensation, history.
**Who** — 🧑‍💼 🎯 (limited)
**Where** — Sidebar → People → **Employees**

### 🧑‍💼 HR Admin

**Create a new employee** (rare — prefer offer acceptance flow):

1. Employees → **New employee**.
2. Fill name, email, hire date, title, department, supervisor.
3. Save. This creates the employee record; grant the auth account separately in **Admin → Org Settings** once they've registered.

**Edit an existing employee**:

1. Open the record. Use the **HR-only** inline form for DOB, personal email, address.
2. To change supervisor, title, department, or comp — file a **PAF** instead of direct edit (creates an audit trail).
3. **Personnel record history** tab shows the unified timeline (PAFs, reviews, training, docs). Filter by category or export CSV.
4. **Photo** — upload from the profile page (HR-only; employees can't replace their own photo).
5. **Link auth account** — if the person has signed in but isn't linked, use the **Employee Account** panel to link by email.

### 🎯 Hiring Manager

- Read-only access to your team's basic info via the directory and org chart.

---

## Employee Import

**What** — Bulk-load employees from CSV.
**Who** — 🧑‍💼
**Where** — Sidebar → People → **Employees** → **Import**

1. Download the template CSV.
2. Fill required columns: `email`, `first_name`, `last_name`, `hire_date`, `title`, `department`.
3. Upload and preview. Fix any red rows.
4. Commit. Rows are inserted and audited.

---

## Photos & ID Badges

**What** — Employee photos and printable CR80 badges with QR verification.
**Who** — 🧑‍💼 (photos & badges), 👤 (view own badge)
**Where** — Employee profile → **Photo** and **Badge** sections; **People → ID Badge Templates**

### 🧑‍💼 HR Admin

1. Open the employee's profile → **Upload photo**. Photos are stored securely; only HR, the employee, and their supervisor can view.
2. Design badges at **People → ID Badge Templates**: layout, colors, logo, fields to include.
3. Click **Generate badge** on the profile → downloads a print-ready CR80 PDF.
4. The QR code links to `/api/public/badge/:serial` — anyone can verify the badge is valid without exposing PII.

### 👤 Employee

- View your own badge on the profile. Ask HR if you need a reprint.

---

## Personnel Record History

**What** — Unified, filterable timeline of everything that's happened to an employee.
**Who** — 🧑‍💼, and the employee (own record)
**Where** — Employee profile → **History** tab

1. Filter by category: PAF, Review, Training, Document, 1-on-1, Comp change.
2. Click any event to expand details and download attachments inline.
3. **Export CSV** for audit responses.

---

## Time Clock (Timekeeping)

**What** — Hourly clock-in/out, exempt schedules, comp time.
**Who** — 👤 👥 🧑‍💼
**Where** — Sidebar → Time & Leave → **Time Clock**

### 👤 Hourly employee

1. Click **Clock In** at the start of your shift. Location and device are logged.
2. Click **Clock Out** for meal break, then **Clock In** to return.
3. At end of shift, **Clock Out**.
4. Review your daily and weekly totals. Submit the timecard at week's end.

### 👤 Exempt employee

1. Your schedule is set by your shift pattern. No punches required.
2. Report exceptions (extra hours, comp time earned) via **Add exception**.

### 👥 Supervisor

1. **Review team timecards** at week's end.
2. Approve or reject each. Rejected cards return to the employee with a note.
3. Adjust missed punches (creates an audited edit).

### 🧑‍💼 HR Admin

- Configure pay periods, overtime rules, and rotation calendars in **Shift Patterns**.
- Run FLSA audits at **Compliance → FLSA Audit**.

**Offline tip** — Punches made offline queue in your device and sync automatically when connectivity returns.

---

## Shift Patterns

**What** — Multi-week rotation calendars (e.g., 4/10s, Kelly shift, 24/48).
**Who** — 🧑‍💼
**Where** — Sidebar → Time & Leave → **Shift Patterns**

1. Create a pattern: name, cycle length in days, per-day hours.
2. Assign to employees via their profile → **Schedule**.
3. The Time Clock uses the pattern to compute expected vs. actual hours.

---

## Leave Requests

**What** — Vacation, sick, bereavement, jury duty, FMLA, etc.
**Who** — 👤 👥 🧑‍💼
**Where** — Sidebar → Time & Leave → **Leave Requests**

### 👤 Employee

1. Click **New request**.
2. Choose leave type, start/end date, and hours.
3. Add a note; attach a doctor's note if required.
4. Submit. It routes to your supervisor.

### 👥 Supervisor

1. Open your **Approvals** inbox.
2. Review the request against team coverage.
3. Approve or reject with a note.

### 🧑‍💼 HR Admin

- Configure leave types, accrual rules, and blackout dates in **Settings**.
- Override balances when needed (audited).

---

## Personnel Actions (PAF)

**What** — Signed, audited changes to an employee's status: promotion, transfer, comp change, termination.
**Who** — 👥 🧑‍💼
**Where** — Sidebar → Time & Leave → **Personnel Actions**

### Create a PAF (👥 Supervisor or 🧑‍💼 HR)

1. **New PAF** → pick the employee and action type (promotion, transfer, salary change, termination, etc.).
2. Fill the action-specific form (new title, new manager, effective date, new comp).
3. Attach supporting docs.
4. **Submit for approval** — the approval chain is generated (supervisor → skip-level → HR). If no supervisor exists, it defaults to the main admin.

### Approve a PAF (👥 or 🧑‍💼)

1. Open **Approvals** or the PAF directly.
2. Read the audit log and the approval chain.
3. Click **Approve** or **Reject** with comment.
4. On final approval, the change is applied to the employee record and logged in personnel history.

**Gotcha** — HR admins can act on any pending step; supervisors only on their own step.

---

## Approvals Inbox

**What** — Central queue for anything awaiting your sign-off.
**Who** — 👥 🎯 🧑‍💼
**Where** — Sidebar → **Approvals**

1. Filter by type: PAF, leave, hire request, offer, requisition, timecard.
2. Click an item to open its full context (form, chain, audit).
3. Approve, reject with comment, or reassign.

---

## Goals

**What** — Individual and cascading objectives.
**Who** — 👤 👥 🧑‍💼
**Where** — Sidebar → Coaching → **Goals**

### 👤 Employee

1. **New goal** → title, description, target date, category (personal, team, org).
2. Update progress weekly.
3. Link goals to review cycles for automatic pull-in.

### 👥 Supervisor

1. View your team's goals in one grid.
2. Coach on stalled goals during 1-on-1s.

---

## Cascades

**What** — Push a parent goal down to reports as child goals.
**Who** — 👥 🧑‍💼
**Where** — Sidebar → Coaching → **Cascades**

1. Open a parent goal → **Cascade**.
2. Pick reports and edit each child goal (title, target date, weight).
3. Submit. Each report sees their new child goal linked back to yours.

---

## 1-on-1s

**What** — Structured recurring meetings between employee and supervisor.
**Who** — 👤 👥 🧑‍💼
**Where** — Sidebar → Coaching → **1-on-1s**

### 👥 Supervisor

1. **Schedule 1-on-1** → pick employee, cadence, template.
2. Before each meeting, draft agenda items. Your report can add theirs too.
3. During the meeting, take shared notes and capture action items.
4. Close the meeting — notes are saved to both timelines.

### 👤 Employee

1. Open the meeting card, add agenda items, view past notes and action items.

### 🧑‍💼 HR Admin

- Manage templates at **1-on-1 Templates** (create, edit, publish).
- When an employee changes supervisors, past 1-on-1s automatically transfer. Manual reassign is available on the employee profile.

---

## Reviews & Review Cycles

**What** — Structured performance reviews, cycle-based.
**Who** — 👤 👥 🧑‍💼
**Where** — Sidebar → Coaching → **Reviews** and **Review Cycles**

### 🧑‍💼 HR Admin — launch a cycle

1. **Review Cycles → New cycle** → name, window, template, participants.
2. Publish. Employees and managers are notified.
3. Monitor completion; run **Calibration** to normalize ratings across managers.

### 👤 Employee

1. Complete your self-review before the deadline.

### 👥 Supervisor

1. Complete manager reviews for each direct report.
2. Discuss in a 1-on-1 and finalize.

---

## Compensation

### Comp Grades

**Who** — 🧑‍💼 · **Where** — **Compensation → Comp Grades**

1. Define grade tiers with min/mid/max ranges.
2. Tie grades to positions.

### Market Ranges

**Who** — 🧑‍💼 · **Where** — **Compensation → Market Ranges**

1. Import market data (survey CSV).
2. Compare current salaries to market; flag under/over.

### Comp Cycles

**Who** — 🧑‍💼 · **Where** — **Compensation → Comp Cycles**

1. **New cycle** → budget, eligibility rules, effective date.
2. Managers propose raises for reports within their allocated budget.
3. HR reviews, calibrates, and approves. Approved changes generate PAFs.

### HR Finance / Budget

**Who** — 🧑‍💼 💵 · **Where** — **HR Finance**

- Track FTE budget vs. actuals by department; feed into requisition approvals.

---

## Hiring — the full flow

### 🎯 Step 1: Create a Requisition

**Where** — Sidebar → Hiring → **Requisitions**

1. Click **New requisition**. The 5-step wizard opens:
   - **Basics** — pick from existing job classifications (auto-populates title, boilerplate posting sections).
   - **Details** — department, hiring manager, budget, target start date.
   - **Posting** — edit the four structured sections (Summary, Duties, Qualifications, Benefits). "Use template" pre-fills boilerplate.
   - **Attachments** — optional PDF brochure and custom HTML/CSS for the careers page.
   - **Review & submit** — sends up the approval chain.
2. Track status: **Draft → Submitted → Approved → Posted**.

### 🧑‍💼 Step 2: Approve

1. Open **Approvals** → find the requisition → review budget and posting.
2. Approve or send back with comments.

### 🎯 Step 3: Post to Careers

1. Once approved, open the req and click **Post publicly**. It becomes visible on `/careers`.
2. Toggle **Internal Careers** to also list on the internal-only board.

### 🎯 Step 4: Applicants

**Where** — **Jobs** → open the job → **Applicant Pool**

1. Review incoming applications; the pipeline groups them by stage.
2. **AI Screening** — select applicants → **Generate AI screening**. Results show a FIT score, strengths, gaps.
3. **Human-in-the-loop**: for each AI recommendation, click **Accept**, **Edit**, or **Dismiss**. Nothing is auto-actioned.
4. **Parsed resume** view highlights the fields the AI extracted.
5. Bulk actions: advance, reject with template email, or move to another stage.

### 🎯 Step 5: Interviews

**Where** — Sidebar → Hiring → **Interviews**

1. On an applicant card, click **Schedule interview**.
2. Choose **In-app LiveKit room** (auto-generated link) or paste an external link.
3. Pick a delivery method for the invitation: **Copy link to clipboard** (default) or **Send email**.
4. Attach an **Interview Kit** (rubric + questions).
5. Panelists join at the scheduled time; ratings are captured in the kit.

**Async ("two-take") interviews**:

1. On the applicant card → **Invite to async interview**.
2. Candidate records answers on their own time via the token link.
3. Reviewers watch playback in the **Async** tab and rate.

### 🧑‍💼 Step 6: Offer

**Where** — Sidebar → Hiring → **Offers**

1. **New offer** → pick applicant, position, comp, start date.
2. Generate the offer letter from a template.
3. Send. Candidate signs via a secure token link at `/offer/:token`.
4. On acceptance, an employee record is created and pre-boarding begins.

---

## Interview Kits

**Who** — 🎯 🧑‍💼 · **Where** — **People → Interview Kits**

1. Create a kit: role, competencies, rubric scale, question bank.
2. Assign kits to interview stages so panelists see the right questions.

---

## Careers Page Customization

**Who** — 🎯 🧑‍💼 · **Where** — **Hiring → Careers Customization**

1. Upload logo, choose colors, write intro copy.
2. Per-job: attach a brochure PDF and add custom HTML/CSS.
3. Preview at `/careers`.

---

## Onboarding (Preboarding)

**Who** — 👤 (new hire), 🧑‍💼
**Where** — Sidebar → Overview → **My Onboarding** (new hire), **People → Employees** (HR)

### 👤 New hire

1. Complete each task card: I-9, W-4, direct deposit, emergency contact, policy acknowledgements.
2. Sign forms with the Forms Runner.

### 🧑‍💼 HR Admin

- Configure the onboarding checklist and forms per worker type.
- Track completion; nudge stragglers.

---

## Offboarding

**Who** — 🧑‍💼 · **Where** — **People → Offboarding**

1. **Start offboarding** on the employee → last day, reason, exit interview date.
2. The workflow generates: final timecard, PTO payout, equipment return, IT deprovisioning, benefits cutoff, exit interview.
3. Each task routes to the right owner (IT, payroll, manager).
4. On completion, the employee status flips to **Terminated** with full audit trail.

---

## Equipment & Provisioning

### Equipment & PPE

**Who** — 🧑‍💼 · **Where** — **People → Equipment**

1. Track assets (laptops, radios, uniforms, keys).
2. Assign on hire, reclaim on offboarding.

### IT Provisioning

**Who** — 🛡️ IT Admin · **Where** — **Workflow → IT Provisioning**

1. On new hire, provisioning tasks appear: create account, assign groups, order laptop, badge access.
2. Mark each complete.

---

## Compliance

### Policies & Policy Campaigns

**Who** — 🧑‍💼 (author), 👤 (acknowledge)
**Where** — **Compliance → Policies** and **Policy Campaigns**

1. HR authors a policy version.
2. Launch a **campaign** to require acknowledgement from a role or department.
3. Employees acknowledge from **My HR**; completion is tracked and audited.

### Training / LMS / Transcripts

**Who** — 👤 👥 🧑‍💼

1. HR assigns training courses (in-app, SCORM upload, or external LMS import).
2. Employees complete; status shows on transcript.
3. Employees **cannot** self-mark completion — an instructor, supervisor, or HR must confirm.

### OSHA / TCOLE / TMRS

**Who** — 🧑‍💼

- **OSHA** — log 300/300A incidents; export annual summary.
- **TCOLE** (Texas peace officers) — track certifications, hours, expirations.
- **TMRS** — Texas municipal retirement contributions and reports.

### EEO Snapshot

**Who** — 🧑‍💼 · Point-in-time EEO-4 categories view for reporting.

### FLSA Audit

**Who** — 🧑‍💼 · Flag exempt/non-exempt mismatches based on duties and salary tests.

### Grievances

**Who** — 👤 (file), 🧑‍💼 (manage)

1. Employee files at **Compliance → Grievances → New**.
2. HR triages, assigns investigator, tracks resolution.

### CBA (Collective Bargaining)

**Who** — 🧑‍💼 · Store agreements and reference clauses in PAFs and grievances.

---

## Documents, Forms, Templates

### Documents

**Who** — 👤 (own), 🧑‍💼 (all)

- Central document store. Employees see their own docs (offer letters, W-2s, acknowledgements). HR sees all.

### Doc Templates & Docs Generator

**Who** — 🧑‍💼

1. Author templates with variables (`{{first_name}}`, `{{title}}`).
2. Generate PDFs in bulk against a selected employee set.

### Forms Library

**Who** — 🧑‍💼 (build), 👤 (fill)

1. Build a form with typed fields and required signatures.
2. Assign to roles or individual employees.
3. Employees complete via the Form Runner; submissions attach to their personnel history.

---

## Payroll

### Payroll Runs

**Who** — 💵 🧑‍💼 · **Where** — **Payroll → Runs**

1. **New run** → pay period.
2. System pulls approved timecards, leave, comp changes.
3. Review exceptions, approve, and export to your payroll bureau.

### Payroll Profiles

**Who** — 💵 🧑‍💼 · **Where** — **Payroll → Profiles**

- Per-employee payroll setup: bureau ID mappings, deductions, garnishments.

### Payroll Export

**Who** — 💵 · **Where** — **Payroll → Export**

- Generate the bureau-specific file (ADP, Paylocity, TMRS report, etc.).

---

## Reports

### Reports

**Who** — 🧑‍💼

- Standard reports: headcount, turnover, tenure, comp distribution, EEO, OSHA.
- Export CSV or PDF.

### Recruiting Reports

**Who** — 🎯 🧑‍💼

- Time-to-fill, source of hire, funnel conversion.

### Audit Log

**Who** — 🧑‍💼 🛡️

- Filter by actor, entity, action. Export for compliance responses.

---

## Admin

### First-run Setup Wizard

**Who** — 🛡️ · **Where** — `/setup`

- 5-step wizard: org identity, first admin, AI provider, email sender, module selection.

### Org Settings

**Who** — 🛡️ · **Where** — **Admin → Org Settings**

- **Roles** — grant `hr_admin`, `hiring_manager`, `supervisor`, `employee`, `it_admin`, `payroll`. Granting `employee` auto-links the auth user to an existing employee record by email.
- **AI config** — choose provider (OpenAI, Azure OpenAI, Lovable Gateway). Set model per feature.
- **Retention** — recording/interview retention periods and archive rules.

### Module Toggles

**Who** — 🛡️ · **Where** — **Admin → Modules**

- Toggle any module or feature on/off org-wide. Disabled modules disappear from all sidebars and routes.

### Identity (SCIM/SSO)

**Who** — 🛡️ · **Where** — **Admin → Identity**

- SCIM v2 endpoint for provisioning from Okta, Entra, JumpCloud.
- SSO configuration guidance.

### Email Templates

**Who** — 🧑‍💼 🛡️ · **Where** — **Admin → Email Templates**

- Edit transactional emails: applicant status, offer, interview invitations, PAF notifications.

### Demo Sandbox

**Who** — 🛡️ · **Where** — **Admin → Demo**

- Provision the "Demo Purpose" HR admin (password `Demo, 1234`). All changes revert automatically after 24 hours.

### Migration

**Who** — 🛡️ · **Where** — **Admin → Migration**

- Import from legacy HRIS (CSV mapping, validation, dry-run, commit).

### Worker Types

**Who** — 🧑‍💼 · Full-time, part-time, seasonal, contractor — controls which forms and policies apply.

### Settings

**Who** — 🧑‍💼 🛡️ · Global preferences: fiscal year, pay periods, time zone, holiday calendar.

---

## LiveKit video interviews — enabling live rooms

**Who** — 🛡️

1. Create a LiveKit Cloud project.
2. In **Admin → Settings**, paste `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
3. Interview scheduling now offers **In-app room** as an option.

---

## Offline PWA

**Who** — 👤 👥

1. Install the app from your browser (Chrome: **Install app**; iOS Safari: **Add to Home Screen**).
2. Offline, you can: clock in/out, submit leave, approve queued items.
3. Actions queue in a FIFO IndexedDB queue and replay via Background Sync when you're back online.
4. A banner shows queue depth; tap **Sync now** to force a drain.

---

## Getting help

- **Help & Docs** (sidebar) — User Guide, Self-Hosting Guide, and this End User Guide.
- **Support** — contact your HR admin or IT admin listed in **Admin → Org Settings**.
- **Bug reports** — include the URL, what you did, and what happened. Screenshots help.

*End of guide.*