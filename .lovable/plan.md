# Municipal HRIS — 90-Day Roadmap

Goal: close the biggest gaps between today's onboarding/compliance system and a working municipal HRIS, sequenced so each milestone is independently usable.

## Prioritization principles

1. **Employee-visible value first** — features the workforce uses daily (time off, self-service) beat back-office plumbing.
2. **Compliance before convenience** — anything tied to FLSA, FMLA, OSHA, or EEO is non-negotiable for a municipality.
3. **Build the system of record before integrations** — own positions, leave, and comp data internally before syncing to ADP/Munis.
4. **Defer payroll engine** — integrate, don't rebuild. Payroll is a 12+ month project on its own.

---

## Days 1–30 — Foundations (System of Record)

Focus: stand up the data models that everything else depends on, plus the highest-impact employee self-service.

### M1.1 Position Management
- `positions` table: title, dept, FLSA class, pay grade/step, budgeted FTE, vacant/filled, reports-to
- Link `employees.position_id` (keep `manager_id` derived from position)
- Org chart view, vacancy report, headcount vs. budget

### M1.2 Pay Structure (data only, no payroll engine)
- `pay_grades` + `pay_steps` tables (grade × step → hourly/annual rate)
- `compensation_history` per employee (effective-dated rate changes, reason codes: hire, step, COLA, promotion, reclass)
- Show current comp + history on employee profile

### M1.3 Time-Off / Leave Foundations
- `leave_types` (vacation, sick, personal, comp, FMLA, military, bereavement)
- `leave_balances` (per employee per type, accrual rules)
- `leave_requests` with supervisor approval workflow
- Employee self-service: request time off, see balances
- Supervisor inbox: approve/deny

**End-of-30 deliverable:** an employee can see their position, pay history, and PTO balance, and request time off. Supervisors approve. HR sees vacancy and headcount reports.

---

## Days 31–60 — Compliance & Employee Self-Service

Focus: the reporting and ESS features that make HR stop using spreadsheets.

### M2.1 FMLA & Leave Compliance
- FMLA eligibility check (12 mo / 1,250 hr rule), 12-week rolling balance
- FMLA case tracking (certification due dates, intermittent vs. continuous)
- Leave usage report (by type, dept, date range)

### M2.2 Compliance Reports
- EEO-4 (public sector equivalent of EEO-1): workforce by job category × race/gender
- OSHA 300 / 300A injury log (uses existing screenings + new incident table)
- FLSA exempt/non-exempt audit report
- ACA hours tracking (avg hours/week over measurement period)

### M2.3 Employee Self-Service Expansion
- Update personal info (address, phone, emergency contacts, dependents) with HR approval queue
- View/download pay stubs (placeholder until payroll integration — upload PDFs from current provider)
- View benefits elections (read-only, sourced from existing benefits_handoffs)
- Document inbox (W-2s, 1095-Cs, policy updates)

### M2.4 Timesheets (basic)
- `timesheets` table with daily entries, project/grant code optional
- Supervisor approval, lock-after-approval
- Overtime calculation per FLSA workweek rule
- Export to CSV for current payroll provider

**End-of-60 deliverable:** HR can pull every standard municipal compliance report. Employees manage their own profile, time off, and timesheets. Pay stubs visible.

---

## Days 61–90 — Workflows, Performance, Integrations

Focus: replace remaining manual processes and connect to the payroll system of record.

### M3.1 Performance & Discipline
- Annual review templates (configurable per worker type / union)
- Goals (SMART), self-assessment, manager assessment, sign-off
- Disciplinary actions: verbal, written, suspension, termination
- Union step-discipline tracker (prior offenses lookup window)
- Grievance log with status workflow

### M3.2 Applicant Tracking (lightweight)
- Public job board route `/careers` listing open `positions`
- Application form (resume upload, EEO survey, voluntary self-ID)
- Candidate pipeline: applied → screened → interviewed → offered → hired
- Convert hired candidate → hire request (reuses existing flow)

### M3.3 Payroll Integration (one provider)
- Outbound nightly export to ADP / Munis / Tyler (whichever the municipality uses)
- Inbound: pay stub PDFs, YTD totals
- Job/grant code mapping for GL feed

### M3.4 Calendar & Notification Automation
- ICS feed for cert expirations, review due dates, leave
- Email digests (supervisor weekly, HR daily)
- Slack/Teams webhook for hire requests + approvals

**End-of-90 deliverable:** full review cycle runs in-system, public job postings drive the hire pipeline, and payroll runs off our position + timesheet + leave data via the chosen provider.

---

## Out of scope for 90 days (call out explicitly)

- Building a real payroll engine (tax tables, direct deposit ACH, W-2 generation) — always integrate, never build
- Pension system integration (PERS/state retirement) — phase 2, requires state-specific certifications
- Benefits open enrollment engine — phase 2, current handoff workflow is sufficient
- Badge system / physical access API — phase 2, depends on which vendor (HID, LenelS2, etc.)
- Mobile native apps — responsive web is enough

---

## Risk & sequencing notes

- **Union contracts gate M3.1** — disciplinary and review workflows must match each CBA. Confirm contracts before building templates.
- **Payroll vendor choice gates M3.3** — ADP, Tyler Munis, Workday Public Sector, and BambooHR all have different APIs. Pick before day 45.
- **Leave accrual rules vary by class** — sworn vs. civilian vs. seasonal often have different accrual tables. Model as data, not code.
- **EEO-4 is biennial, not annual** — but the data model must capture it continuously from day 1.

---

## Technical notes (for engineering)

- All new tables follow the existing pattern: GRANTs on create, RLS enabled, `user_id`-scoped self-service policies, `has_role()` for HR/supervisor access (per project security memory).
- Reuse `create_hire_request` / `decide_hire_request` RPC pattern for new approval workflows (leave, profile changes, discipline).
- New routes under `src/routes/_authenticated/` with the same query-in-loader + `useSuspenseQuery` pattern.
- Public ATS route under `src/routes/careers.tsx` (unauthenticated); application submission via server route under `src/routes/api/public/applications.ts` with rate limiting and signature/CAPTCHA.
- Payroll exports as scheduled server functions; inbound files via `api/public/*` webhook with signature verification.

---

## Suggested next step

Pick one of:
1. **Approve as-is** — I'll start M1.1 (Position Management) on the next turn.
2. **Reorder** — e.g. promote Timesheets to days 1–30 if payroll integration timing demands it.
3. **Trim** — drop ATS or Performance from 90 days to add depth elsewhere (e.g. benefits open enrollment).
