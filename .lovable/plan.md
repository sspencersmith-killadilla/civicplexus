
# Go-Live Pack — First Texas City

Goal: get Noöpolis production-ready as the system of record for a small Texas city, with pay flowing to an outside payroll bureau and Texas-specific compliance landing on day one.

Scope is sequenced into three waves. Wave 1 is the cutover-blocking work. Waves 2 and 3 follow once Wave 1 is stable.

---

## Wave 1 — Cutover blockers (must exist before go-live)

### 1. Payroll Bureau Export

A pay-period export that the city's bureau (ADP, Paylocity, Paycom, or Tyler Munis Payroll) can import. No live API — a generated file the payroll clerk uploads.

**New module** `/payroll`
- **Pay calendar** — define pay groups (e.g., "General", "Public Safety"), pay frequency (biweekly / semi-monthly), period start/end, check date, cutoff time. Table `pay_calendars`, `pay_periods`.
- **Period assembly** — for a selected period, gather: current `employee_comp` for each active employee, approved `leave_requests` overlapping the period (PTO / sick / FMLA), any one-time items (bonus from comp cycle finalize, retro pay, deduction). Show a review grid with totals and a variance-vs-last-period column.
- **Export profiles** — `payroll_export_profiles` table picks one of: ADP Workforce Now, Paylocity Web Pay, Paycom, Tyler Munis Payroll, Generic CSV. Each profile is a column map (employee id field, earnings codes, deduction codes, GL code) plus file format (CSV / fixed-width). Ship the four named profiles seeded.
- **Generate file** — server fn writes the file to a private storage bucket `payroll-exports`, records an immutable `payroll_runs` row (period, profile, file hash, generated_by, totals), and locks the period. Re-running requires an HR-admin override that creates a corrective run, never overwrites.
- **Sign-off** — two-person rule: preparer generates, approver signs off before the file can be downloaded. Reuses existing `approval_chains` shape.

### 2. HRIS Data Migration Importer

The existing `/employees/import` is single-table CSV. Replace with a guided multi-entity importer.

**`/admin/migration`** (HR admin only)
- **Source profiles** — seeded mappers for Tyler Munis HR, NEOGOV, BambooHR, ADP, generic CSV. Each profile names the expected files and column maps.
- **Staged import** — uploads land in `import_jobs` (already exists, extend), validate, preview diffs, then commit. Order is fixed: positions → worker types → employees → managers (second pass to resolve manager_id) → comp history → leave balances → certifications → policy acknowledgments. Each stage is idempotent on a stable external key.
- **Reconciliation report** — row-by-row outcome (created / updated / skipped / failed with reason), downloadable. Failed rows are re-importable after fix.
- **Cutover mode** — toggle on `org_settings` that disables hire-request creation and notifications while bulk import runs, so the city doesn't get blasted with onboarding emails for backfilled employees.

### 3. SSO + MFA enforcement

Today `org_settings.sso_metadata_url` is captured but not enforced.

- Wire SAML via `supabase--configure_saml_sso` with the city's Entra/Okta metadata.
- Add `org_settings.require_mfa` and `org_settings.sso_only` toggles. When `sso_only` is on, password sign-in is blocked for non-admins; admins keep a break-glass password path with MFA required.
- Role-grant audit screen at `/audit` filter preset: every `user_roles` insert/update with actor + timestamp. Already partially there — add the preset and CSV export.

---

## Wave 2 — Texas compliance pack

### 4. TWC New-Hire Reporting

Texas employers must report every new hire within 20 days to the Texas Attorney General's office (file format: standard W-4-based layout).

- New table `new_hire_reports` (employee_id, report_period, file_id, submitted_at, ack_received_at).
- Trigger on `employees.status` → `active` queues a row.
- Weekly batch generates the standard layout file (Federal Employer ID, employee SSN/name/address/DOB/hire date) to `compliance-exports` bucket and notifies HR.
- `/compliance/new-hire-reporting` lists batches and pending hires.

### 5. TMRS Monthly Contribution File

Texas Municipal Retirement System requires a monthly file: covered employees, gross compensation, member contributions, prior-month adjustments.

- New tables `tmrs_enrollments` (employee_id, plan, member_rate, enrollment_date, exit_date) and `tmrs_monthly_files` (period, file_id, total_member_contrib, total_employer_contrib, totals_hash, submitted_at).
- Composer pulls the month's `payroll_runs` totals filtered to TMRS-covered employees, applies the city's member-contribution rate, and writes the TMRS-specified layout (member, payroll, adjustment records).
- Variance check against prior month flags >10% swings before sign-off.
- Two-person sign-off like payroll export.

### 6. TCOLE Tracking for Peace Officers

Texas Commission on Law Enforcement requires per-officer continuing-ed hours by license cycle.

- Add `worker_types.is_peace_officer` boolean. New table `tcole_licenses` (employee_id, license_number, license_level, issued_at, cycle_start, cycle_end). Extend `certifications` with `tcole_topic` enum (legislative update, cultural diversity, de-escalation, crisis intervention, etc.).
- `/compliance/tcole` dashboard: officers in current cycle, hours by topic vs requirement, expiring licenses 90/60/30-day nudges.
- Bulk completion entry by class roster.

---

## Wave 3 — Conditional + ops hardening

### 7. Civil Service Ch. 143 (conditional)

Only relevant if the city has PD or FD and population >10k. Gated behind an `org_settings.civil_service_enabled` flag.

- Eligibility lists (`cs_eligibility_lists`), promotional exams (`cs_exams`, `cs_exam_results`), beginning-position rule enforcement on hire requests, posting-period enforcement on requisitions for classified positions.
- Surfaces in existing `/positions`, `/hire-requests`, `/jobs` with a "Classified — Ch. 143" badge and the extra workflow gates.

### 8. Ops runbook

- Nightly logical backup of the Lovable Cloud DB to a city-owned S3-compatible bucket, retention schedule per `org_settings.retention_policy`.
- Restore-drill script + documented runbook in `/docs/SELF_HOSTING_GUIDE.md`.
- Health page `/admin/health` showing DB health, last payroll run, last new-hire batch, last TMRS file, queue backlogs.

---

## Out of scope (call out explicitly)

- Time & attendance (timesheets, punches, shift differentials, OT calc). Big enough to be its own next plan. Until then, the city continues using whatever T&A they already have, and its export feeds the payroll review grid as a CSV upload.
- Built-in payroll engine (gross-to-net, tax tables, direct deposit ACH, W-2 print). The bureau owns that.
- Open Records (PIA Ch. 552) response builder — noted for a later wave.
- Public Information Act metadata tagging on documents — later wave.

---

## Recommendation

Build **Wave 1 first** — without payroll export and a clean importer, no city can cut over, regardless of how good the compliance pack is. Estimated to ship as one coherent module: `/payroll`, `/admin/migration`, plus SSO/MFA toggles in `/settings`.

Approve this plan and I'll start with Wave 1.
