# Municipal HRIS Expansion — Items 2, 3, 4, 6, 7, 8, 9

This is a large scope (~7 distinct modules). I'll deliver in three phases so each phase produces working, testable functionality rather than half-built systems.

## Phase A — Identity, Budget, Payroll (items 2, 3, 4)

### 2. SCIM / Active Directory lifecycle
- New tables: `identity_providers` (Azure AD / Google / Okta config), `scim_tokens` (bearer tokens for inbound SCIM), `identity_links` (employee ↔ external `objectId`), `provisioning_events` (audit).
- Public SCIM 2.0 endpoint under `src/routes/api/public/scim/v2/*` implementing `/Users` GET/POST/PATCH/DELETE with bearer-token auth, signature-verified.
- Outbound hooks on employee status transitions (`active` → `terminated` etc.) that enqueue provisioning events (suspend, restore, group-membership).
- Admin UI `/admin-identity`: register IdP, mint SCIM tokens, view sync log, manually re-link employees.

### 3. Position budget enforcement (build on existing `/hr-finance`)
- New table `position_budgets` (department, fiscal_year, budgeted_fte, budgeted_amount, notes).
- Server fn `checkRequisitionBudget(department, fte)` returning remaining headroom.
- Wire into requisition wizard: warn at submit, hard-block at approval if over budget unless HR admin overrides with reason captured in audit.
- Fiscal year selector + budget editor on `/hr-finance`.

### 4. Payroll export depth
- Build out `payroll_export_profiles` UI (already scaffolded as `payroll.profiles.tsx`): column-map editor, earnings/deduction code mapping, preview.
- Built-in templates: Tyler Munis, Tyler ERP/Incode, BS&A, Generic CSV, ADP, Paycom.
- `runPayrollExport(profileId, payRunId)` server fn generating CSV/fixed-width, stored in `payroll-exports` bucket with audit row.

## Phase B — Public Safety Union & Mobile (items 6, 7)

### 6. CBA / union contracts
- Tables: `bargaining_units`, `cba_contracts` (unit, effective range, doc URL), `cba_step_tables` (grade × step × rate), `cba_longevity_rules` (years → pay bump), `employee_union_membership`.
- Anniversary step engine: nightly job advances eligible employees, generates draft PAFs for review.
- Longevity pay calculator surfaced on employee comp tab and fed into payroll export.
- Admin UI `/cba` for HR admin to manage contracts and tables.

### 7. Mobile / PWA
- Add `vite-plugin-pwa` config with manifest, icons, offline shell for: clock in/out, leave request, approvals inbox, today's shift.
- Service worker caches the auth shell + last-known data; queues clock punches when offline and replays on reconnect.
- Mobile-optimized layouts for the four flows above (existing pages are desktop-first).

## Phase C — Reporting & LMS (items 8, 9)

### 8. Advanced reporting
- `/reports` hub with three flagship reports:
  - **EEO-4** biennial — pivot of employees by EEO function × salary band × race/gender, exportable CSV per federal spec.
  - **OSHA 300/300A/301** — new `osha_incidents` table + log/summary/incident-report forms; year-end PDF export.
  - **TMRS monthly** — already partially present, add reconciliation dashboard and variance vs prior month.
- Each report has saved-snapshot history and a downloadable artifact stored in `compliance-exports`.

### 9. LMS / TCOLE integration
- Extend `courses` with `external_provider` (TCOLE, Target Solutions, Vector, manual) and `external_course_id`.
- New `lms_credit_imports` table for CSV roster imports + a parser that matches by TCOLE PID / email and auto-completes `employee_training` rows, issuing certifications via the existing `tg_training_complete` trigger.
- Admin UI `/lms-imports`: upload CSV, preview matches, commit.

## Technical notes

- All new tables: full RLS + GRANT block (authenticated + service_role; anon only where the SCIM endpoint is involved, gated by token middleware not RLS).
- SCIM endpoint authenticates via `scim_tokens` table (bcrypt-hashed), not RLS.
- New `app_role` values needed: none — reuse `hr_admin` / `supervisor`.
- Module registry entries added to `src/lib/modules.ts` for each new page so super-admin module toggle still governs.
- Tests added to `tests/` for budget enforcement and CBA step progression.

## What I'd like to confirm before starting

1. Phase order — proceed A → B → C, or reprioritize?
2. SCIM direction: **inbound** (Azure AD pushes users to CivicPlexus) is what most municipalities want; **outbound** (we push to AD) is heavier. I'm planning inbound first, with outbound suspension hooks. OK?
3. Payroll templates: Tyler Munis + generic CSV is the minimum — should I include the others now or add on request?
4. PWA scope: the four flows above (clock, leave, approvals, today's shift). Anything else mobile-critical?

Reply with answers (or just "go") and I'll start with Phase A.