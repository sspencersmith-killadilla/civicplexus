## Seed Noöpolis, TX as a fully populated instance

Model a ~85k-pop home-rule Texas city with realistic policies, elected officials, board members, hiring pipeline, and public applications — everything wired through the existing schema so pages look "lived-in" on first load.

### 1. Organization identity

- Update `org_settings` to Noöpolis, TX (home-rule, council-manager form) with realistic address, phone, logo placeholder, brand color.
- Ensure default `city_clerk` and `hr_admin` roles exist (schema already supports).

### 2. Policy library (~60 policies)

Publish into `policies` (status `active`, version 1, effective dates staggered 2019–2026), grouped by category. Bodies modeled on publicly available handbooks from cities like Georgetown, Round Rock, Kyle, San Marcos, and Cedar Park.

**HR handbook (25):** EEO, Anti-Harassment & Non-Discrimination, ADA Accommodation, FMLA, Military Leave, Bereavement, PTO/Vacation, Sick Leave, Holidays, Compensatory Time (FLSA), Overtime, Timekeeping, Attendance, Dress Code, Workplace Violence, Drug-Free Workplace, Reasonable Suspicion Testing, Tobacco-Free, Progressive Discipline, Grievance Procedure, Performance Evaluation, Promotion & Transfer, Reduction-in-Force, Separation & Exit, Nepotism.

**Ethics / conduct (8):** Code of Ethics, Conflict of Interest & Ch.176 Disclosure, Gifts & Gratuities, Political Activity (Hatch/Ch.150), Outside Employment, Whistleblower, Confidentiality, Social Media.

**IT & records (6):** Acceptable Use, Email/Text Retention, Passwords & MFA, Mobile Device, Public Information Act Requests, Records Retention Schedule (per TSLAC).

**Finance & procurement (6):** Purchasing (Ch.252 thresholds), Credit Card, Travel & Per Diem, Take-Home Vehicle, Fixed Assets, Fraud Prevention.

**Public safety (8):** TCOLE Training Compliance, Body-Worn Camera, Use of Force, Pursuit, Racial Profiling (Sandra Bland Act), Off-Duty Employment (PD), Firefighter Two-Hat, EMS HIPAA.

**Operations & safety (7):** OSHA/Hazcom, PPE, CDL Drug & Alcohol (49 CFR 382), Confined Space, Trenching, Bloodborne Pathogens, Emergency Operations.

Each row: title, category, plain-English summary (~3–5 paragraphs), acknowledgment required flag, review cadence.

### 3. Elected officials & boards

Fill the 4 existing `official_bodies` and add missing ones so the roster looks complete: City Council (Mayor + 6 at-large), Planning & Zoning, Zoning Board of Adjustment, Parks & Recreation Board, Library Board, Ethics Review Commission, Historic Preservation, EDC Type A, EDC Type B, Airport Advisory, Civil Service Commission.

- Seed `officials` (~55 residents) with names, bios, publish flags.
- Create active `official_terms` filling every seat with staggered start/end dates; two council seats expire within 120 days to exercise the notification cron.
- Add a handful of `official_disclosures` (Ch.176) and `official_attendance` for recent meetings so the reimbursement generator has data.

### 4. Employees & departments

Extend the existing 30 employees to ~85 across: City Manager's Office, City Secretary, HR, Finance, IT, Police, Fire/EMS, Public Works, Utilities, Parks & Rec, Library, Planning & Development, Municipal Court, Communications. Assign realistic job titles, hire dates, pay grades.

### 5. Hiring pipeline (12 reqs, ~90 applicants with resumes)

Open requisitions: Police Officer, Firefighter/Paramedic, Senior Planner, Librarian I, Utilities Crew Leader, Accountant II, IT Systems Administrator, Parks Maintenance Worker, Executive Assistant to City Manager, Assistant City Attorney, Building Inspector, 311 Customer Service Rep.

For each: post JD, hiring manager, department, salary range, and 5–10 applicants. Applicant records get:
- Realistic names/emails/phones
- `resume_url` pointing to a seeded plain-text resume stored in the existing resumes bucket (uploaded via storage tool)
- `cover_letter` text
- `answers` for screening questions
- Statuses spread across `new/screening/interview/offer/rejected`
- Ratings 1–5 skewed to create clear AI-ranking winners
- 2–3 strong / 3–5 mid / 2–3 weak resumes per req so the ranker has signal

### 6. Public board applications (~18)

Seed `board_application_submissions` + `board_application_interests` with residents applying to Parks, Library, EDC, Historic, and P&Z — most with 2–3 board interests and one marked primary. Mix statuses: 10 `submitted`, 4 `under_review`, 3 `shortlisted`, 1 `approved`. Include cover letters and one uploaded qualifications doc for a couple.

### 7. Supporting data

- 6 recent `official_meetings` per active body with attendance rows.
- A few `notifications` in the inbox for HR/clerk (term expiring, new application received).
- 5–8 sample `form_definitions` submissions to show activity.
- Realistic `email_templates` set already exists; leave as-is unless empty.

### Technical approach

Delivered as **one idempotent SQL migration** (`20260702_seed_noopolis.sql`) that:
1. Uses `ON CONFLICT DO NOTHING` on natural keys (slugs, emails) so re-running is safe.
2. Builds all data in CTEs referencing the org and inserted IDs — no hard-coded UUIDs.
3. Skips storage uploads inside SQL; resume text files ship as plain-text `resume_url` values pointing to a seeded row in `documents` (or as inline text if the bucket needs a separate script). If the resumes bucket requires binary upload, a companion `scripts/seed-resumes.ts` runs once via `bun` using `supabaseAdmin` and is documented in the guide.
4. Idempotency guard: wrap the whole thing in `DO $$ ... IF (SELECT count(*) FROM policies) > 20 THEN RETURN; END IF; ... $$` so it only fires on a fresh instance (existing 2 policies stay).

No schema changes, no new tables, no new functions — pure data seeding against the already-approved schema. Auto-generated `types.ts` does not need to change.

### Deliverables

- `supabase/migrations/<ts>_seed_noopolis.sql` — the full seed.
- Optional `scripts/seed-resumes.ts` if binary resume upload is needed.
- Short note in `docs/SELF_HOSTING_GUIDE.md` explaining that seed data ships and how to skip it (`SKIP_SEED=1` or comment out the migration for production).

### What you'll see after apply

- `/policies` shows a full handbook grouped by category.
- `/officials` public roster lists 11 bodies with photos-ready officials.
- `/admin-officials` → Applications tab has 18 pending items to triage.
- `/jobs` and `/careers` show 12 openings with dozens of applicants each; opening any req exercises the AI ranker against real resume text.
- Dashboard tiles for term expirations, pending approvals, and open reqs populate.
