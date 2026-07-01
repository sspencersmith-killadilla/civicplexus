# Elected Officials & Board Appointees Module

A first-class module (`/officials`) that keeps officials out of the staff HR lifecycle where it doesn't apply, while reusing existing infrastructure (documents, compliance, provisioning, audit).

## End-to-end lifecycle

```text
Body created (Council / P&Z / Library Board / …)
        │
        ▼
Seats defined per body (Place 1, District 3, At-Large, Chair, Ex-Officio…)
        │
        ▼
Vacancy declared
   • Elected: awaits election result             • Appointed: HR/Clerk starts nomination
        │
        ▼
Term created  → status: pending
   • Official record (new or existing), seat, term start/end, appointing authority
        │
        ▼
Swearing-in
   • Oath of office signed + uploaded            • Bond uploaded (if required)
   • Term status → active                        • Public roster reflects seat filled
        │
        ▼
Onboarding tasks (config per body)
   • Statement of Financial Interest (annual)    • Chapter 176 conflict disclosure
   • Open Meetings Act training (TX Gov 551.005) • Public Info Act training (552.012)
   • Ethics attestation                          • Provisioning (email, portal, badge)
        │
        ▼
Serving
   • Meeting attendance (optional) → drives per-meeting stipend
   • Fixed stipend runs on pay calendar          • Expense reimbursements
   • Annual disclosure cycles auto-open + notify • Compliance dashboard tracks currency
   • Term-expiration dashboard (90/60/30 day warnings) for Clerk
        │
        ▼
End of term
   • Expiration  → auto-close term, seat vacant  • Reappointment → new term, no re-oath if same body allows
   • Resignation (future effective date)         • Recall / removal
   • Offboarding: revoke provisioning, final stipend, retain records per retention policy
```

## New role & permissions

- Role `elected_official` — lands on a purpose-built `/my-service` page (not `/my-hr`). Sees own term, disclosures, training, stipend history. No supervisor card, no PAF, no performance review, no 1-on-1.
- Role `city_clerk` — full CRUD on bodies/seats/terms/oaths/disclosures; drives the public roster.
- HR admin retains override everywhere.
- Permission keys: `officials.read`, `officials.write`, `officials.publish_roster`, `officials.disclosures.review`, `officials.stipend.approve`.

## Public roster (no login)

- `/officials` (top-level, SSR) — grid of bodies with member cards: photo (opt-in), name, seat, term dates, contact if published, next meeting.
- `/officials/$body` — full body page with roster, upcoming term expirations, agendas link (external).
- OG tags per body; hidden fields respect a per-official `publish_contact` flag.

## Compensation (mixed, configurable per body)

- Per body: `comp_model` = `unpaid | fixed_stipend | per_meeting | mixed`.
- `fixed_stipend`: monthly/annual amount, generated as payroll lines on the existing pay calendar.
- `per_meeting`: requires meeting attendance record; amount × attended meetings per period.
- Reuses `payroll_runs` / `payroll_run_lines`; new pay type `officials_stipend`.
- Reimbursement: reuses `documents` for receipts, new `officials_reimbursements` table with approve → payroll line.

## Schema (new tables — all with GRANTs + RLS)

- `official_bodies` — name, kind (`council`|`board`|`commission`|`authority`), comp_model, roster_public, meeting_cadence, notes.
- `official_seats` — body_id, seat_label, seat_number, is_ex_officio, is_chair, appointed_by, term_length_months.
- `officials` — person record (may or may not link to `employees` / `auth.users`), name, dob (optional), contact, photo_id, publish_contact bool.
- `official_terms` — official_id, seat_id, appointment_type (`elected`|`appointed`|`ex_officio`), start_date, end_date, appointing_authority, status (`pending`|`active`|`expired`|`resigned`|`removed`), oath_document_id, bond_document_id.
- `official_disclosures` — term_id, kind (`sfi`|`ch176`|`ethics_attest`), cycle_year, due_date, submitted_at, document_id, status.
- `official_training` — thin bridge to existing `employee_training`-style rows scoped to officials (or reuse `employee_training` when the official also has an `employees` row; keep a `subject_kind` discriminator).
- `official_meetings` — body_id, meeting_date, agenda_url, minutes_url.
- `official_attendance` — meeting_id, official_id, present bool, notes. Drives per-meeting stipend.
- `officials_reimbursements` — term_id, incurred_date, amount, purpose, receipt_document_id, status.
- Extend `payroll_run_lines` with an optional `official_term_id` FK for stipend traceability.

## Server functions (new)

- `officials.functions.ts`: `listBodies`, `getBody`, `createBody`, `upsertSeat`, `createTerm`, `swearIn` (uploads oath, flips status → active, kicks off onboarding disclosures/training), `endTerm` (expiration/resignation/removal + audit + provisioning revoke), `recordAttendance`, `generateStipendRun`.
- `officials-public.functions.ts` (no auth): `getPublicRoster`, `getPublicBody`.
- `officials-disclosures.functions.ts`: annual cycle opener (pg_cron), submit, review, remind.

## PAF integration

Officials don't use staff PAFs. Instead, `official_terms` status changes emit the same audit + notification surface (reusing `audit_events`) so the Clerk gets a familiar timeline. Reappointment is a new term row; the audit view stitches history across terms per official.

## Public roster URL structure

- `/officials` — index (all bodies)
- `/officials/$bodySlug` — body page
- `/api/public/officials/roster.ics` — meeting calendar (optional, later)

## UI pages

- `/officials` (public + auth-aware) — public roster
- `/admin/officials` — Clerk/HR management: bodies, seats, terms, term-expiration dashboard, swearing-in dialog, disclosure oversight, attendance entry, stipend run
- `/my-service` — signed-in official self-service (disclosures due, training due, stipend history, upload receipts)
- Sidebar: new "Governance" group housing Officials + Public roster link

## Docs / demo

- Seed: City Council (7 seats), P&Z (5), Library Board (7), Parks Board (5) with realistic terms, one pending disclosure, one 30-day term expiration.
- Add "Elected officials & boards" section to `USER_GUIDE.md`, `END_USER_GUIDE.md`, and demo tour.

## Out of scope for this plan (call out explicitly)

- Agenda / minutes authoring (BoardDocs-class) — link out only.
- Election results ingest.
- Live meeting video/streaming.

## Rollout order

1. Schema + RLS + role/permissions
2. Admin management pages + swearing-in flow
3. Public roster
4. Disclosures + training cycles
5. Attendance + stipend generation
6. Reimbursements
7. Docs + demo seed
