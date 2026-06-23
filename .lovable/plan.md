
# Making Kyberna a complete municipal HR system

You already have the core HRIS + ATS + performance + coaching + grievance + onboarding stack. To be genuinely *municipal-grade* (vs. a generic mid-market HRIS), the missing pieces fall into seven domains. Each tier below is roughly one release; tier 1 closes the most painful daily gaps a city HR director would hit.

## Tier 1 — Daily operational must-haves

**Time, attendance & leave**
- Leave plans (vacation, sick, comp time, FMLA, military, jury, bereavement, donation pools) with accrual rules per worker type / bargaining unit and carryover caps.
- Leave requests + supervisor approval, calendar view, balance display on each employee record.
- FLSA comp-time bank (1.5× overtime → comp time) and use tracking.
- FMLA case tracking: eligibility check (12 months / 1,250 hours), 12-week rolling balance, intermittent leave hours, certification dates.

**Personnel Action Forms (PAFs)**
- Generic workflow engine: hire, transfer, promotion, demotion, pay change, separation, leave start/return.
- Routing rules (supervisor → dept head → HR → finance) with effective-dated changes that update employee record on approval.
- Replaces the ad-hoc hire-request + approval-chain mix with one consistent form.

**Employee self-service portal**
- Personal info, emergency contacts, beneficiaries, direct deposit, W-4/state withholding, address change (triggers PAF).
- Pay stub / W-2 download (placeholder until payroll integration).
- Leave balances + request form, certification renewals, training due dates, policy acknowledgments — all in one "My HR" dashboard.

## Tier 2 — Civil-service & labor-relations (the municipal differentiator)

**Civil service / merit hiring**
- Eligibility lists (registers) per classification, with score, rank, expiration, and veterans' preference points.
- Certification of candidates ("Rule of 3 / 5 / N") from a register to a vacancy; tie into existing requisitions.
- Examination tracking (written/oral/physical/agility) with scoring and banding.
- Provisional / temporary / acting appointments with auto-expiration alerts.

**Collective bargaining & unions**
- Bargaining unit table; assign employees and positions.
- Contract repository with effective dates, key clauses (steps, shift diff, longevity, OT rules).
- Seniority lists generated per unit / per classification (date-of-hire, classification seniority).
- Dues deduction status + change forms.
- Grievance workflow already exists — extend with CBA-step routing (step 1 supervisor → step 2 dept head → step 3 HR → arbitration) and timeline enforcement per contract.

**Pay plans & step progression**
- Pay table editor: grade × step matrices with effective dates.
- Auto step increases on anniversary (with supervisor sign-off gate).
- Longevity pay, shift differentials, certification pay, education incentives — all as additive rules.
- Comp study tooling: compare position salaries against pay table / benchmarks.

## Tier 3 — Compliance, safety & risk

**EEO-4 reporting** (required biennially for local governments ≥100 employees): job categories, function codes, demographic counts, auto-generated submission file.
**OSHA recordkeeping**: 300 log, 300A summary, 301 incident form, electronic submission file for OSHA ITA.
**Workers' compensation**: claim intake, light-duty/return-to-work tracking, lost-time reporting.
**Drug & alcohol program** (FTA / DOT for transit & CDL holders): random pool selection, test results chain-of-custody, follow-up testing schedules.
**I-9 / E-Verify**: section 1 employee, section 2 HR, reverification calendar, audit-ready storage.
**Background checks & fingerprinting**: vendor handoff status (LiveScan, Accurate, etc.), expiration for renewable clearances (CJIS, child-care, etc.).
**Public records retention**: per-document retention schedule aligned to state records law, scheduled destruction queue with HR approval.

## Tier 4 — Public safety & specialized workforces

- Rank structure separate from classification (PD/FD).
- POST / EMT / paramedic / CDL certification tracking with renewal alerts already partially present — extend with continuing-education-hour ledgers.
- Promotional exam administration, eligibility band, time-in-grade rules.
- Shift bidding & rotation calendars; minimum-manning alerts.
- Body armor, uniform, weapons issuance — extend equipment module with serialized assets & retirement dates.

## Tier 5 — Discipline & due process

- Progressive discipline ladder (verbal → written → suspension → termination) per CBA.
- Loudermill / Skelly pre-disciplinary hearing workflow with notice templates, employee response, decision letter.
- Appeal routing to civil service commission / arbitration.
- Sealed-vs-active disciplinary record retention rules.

## Tier 6 — Integrations & data exchange

- **Payroll outbound**: configurable export to common municipal payroll systems (Tyler Munis / Eden, Workday, ADP, OpenGov, BS&A) — employee master, PAF deltas, leave usage, timecard summaries.
- **Retirement system**: monthly contribution file for state pension (PERS / TRS / equivalents).
- **Benefits carriers**: existing benefits-handoff hook → real EDI 834 generation for open enrollment.
- **SAML / OIDC SSO** for the city's IdP (Azure AD / Okta / Google Workspace) — beyond the current Google broker.
- **Microsoft Graph / Google Workspace provisioning**: auto-create accounts, group membership, deprovision on separation. Extend existing provisioning module.
- **IT-asset systems** (Jamf, Intune, SCCM) for laptop/phone lifecycle.

## Tier 7 — Transparency, analytics & polish

- Public-facing **org chart** + **vacant positions** + (opt-in) **salary lookup**, all reading from data you already have.
- HR analytics dashboard: turnover (voluntary/involuntary), time-to-fill, vacancy rate, diversity by classification, training completion, grievance volume, comp-ratio.
- Saved reports + scheduled CSV/PDF email delivery.
- WCAG 2.1 AA pass on public pages (careers, org chart, application portal).
- Spanish-language toggle for employee self-service and public careers.
- Mobile-first review of field-worker flows (timecard, leave request, paystub, certifications).
- API tokens for read access (department heads pulling their own data into Excel/Power BI).

## Cross-cutting hardening

- **Effective-dated history** on every employee field that drives pay/benefits (department, position, pay step). Audit table already exists; promote to first-class "employee history" UI.
- **Configurable approval chains** as a tenant-level admin screen (you have the engine; expose the UI).
- **Email/SMS delivery** wired through Resend + Twilio (currently in-app only) — gated by user notification preferences.
- **Job retry / dead-letter** for the import_jobs pattern; reuse it for any long-running task.
- **Data exports** for every entity (right-to-data-portability for separations, FOIA requests).

## Sensible build order

1. Tier 1 (time/leave, PAFs, self-service) — biggest daily ROI, unblocks payroll conversations.
2. Tier 2 civil service + unions — the thing generic HRIS products *don't* do, your moat.
3. Tier 3 compliance reporting — what gets HR directors fired if missing.
4. Tier 6 payroll/SSO integrations — the buying decision usually hinges on this.
5. Tier 4, 5, 7 — vertical expansion (public safety), maturity (discipline), polish.

Want me to break tier 1 into an implementation plan and start building?
