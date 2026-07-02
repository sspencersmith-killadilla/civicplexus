## Public Board Application Portal

Add a resident-facing portal for applying to serve on boards/commissions, plus a candidate-filing intake for elected seats. All submissions flow to a staff review queue with council approval workflow.

### 1. Public "Serve on a Board" portal

New public routes:
- `/serve` — landing page listing every body flagged `accepting_applications=true` with description, meeting cadence, seats available, and current vacancies count.
- `/serve/apply` — application form. Residents pick **multiple boards of interest** (multi-select) and mark **one primary**. Fields default to name, address, email, phone, employment, qualifications, statement of interest, conflicts disclosure, cover-letter file upload.
- `/serve/candidate-filing` — separate flow for filing to run for an elected seat (council/mayor). Downloadable packet + upload of signed forms (petition, statement of officer, campaign treasurer, ethics affidavit). Not an "apply for appointment" — it's an intake for the clerk.

### 2. Staff-configurable intake form

- Reuse existing `form_definitions` / `form_submissions` tables (already power `/forms`).
- Two managed form keys: `board_interest_application` and `candidate_filing_intake`.
- HR/City Clerk edit the schema at `/admin-officials` → new "Application form" tab (add/remove/reorder fields, mark required, file-upload fields).
- Board-selection and primary-preference are always present (system fields, not editable), so multi-board logic keeps working.

### 3. Data model (new tables)

- `board_application_submissions` — one row per resident submission (name, email, phone, address, statement, cover_letter_path, form_data jsonb, status: `submitted|under_review|shortlisted|approved|declined|withdrawn`, decided_at, decided_by).
- `board_application_interests` — join table (submission_id, body_id, is_primary, seat_id nullable) so one submission covers multiple boards.
- `candidate_filings` — separate table for elected-seat filings (seat_id, candidate name, party if applicable, packet_files[], status: `received|verified|deficient|withdrawn`, verified_by).
- New storage bucket `board-applications` (private; signed URLs for cover letters + filing packets).
- Add `accepting_applications boolean default false` and `application_instructions text` to `official_bodies`.

RLS: anonymous inserts allowed via a server route `/api/public/board-application` (rate-limited, validated with Zod); no anon read. Reads restricted to `hr_admin`, `city_clerk`, and elected officials on the review committee.

### 4. Staff review workflow

New page `/admin-officials` → "Applications" tab:
- Inbox grouped by body, filterable by status and primary interest.
- Detail drawer: applicant info, all boards ranked (primary highlighted), cover letter preview, form answers, internal notes.
- Actions: **Shortlist**, **Approve → convert to Official + Term** (opens existing "Swear in" wizard prefilled), **Decline** (optional templated email), **Withdraw**.
- Every decision writes to `paf_audit`-style `board_application_audit` log.
- Council approval loop: reuse `approval_chains` — an approved shortlist item can be routed to council for vote (single-step approval chain with `city_council` role approvers).

### 5. Notifications & exports

- On submit: email confirmation to applicant + notification to city clerk & HR (reuse `officials_notify_targets()`).
- CSV export of applications (all statuses, date range) from the Applications tab.
- Public `/serve` page shows "Application received — next council review on ___" confirmation screen with a signed status-check link (reuses `candidate_tokens` pattern).

### 6. Docs & sidebar

- Add "Serve on a board" link in the public footer of `/officials`.
- Update User Guide, End User Guide, and Self-Hosting Guide (Governance §15) with the new portal, form editor, review workflow, and buckets.

### Technical notes

- Server functions in `src/lib/board-applications.functions.ts` (auth'd staff CRUD) and public writes via `src/routes/api/public/board-application.ts` (Zod-validated, hCaptcha-style honeypot).
- Signed upload URLs for cover letters, mirroring `createOfficialPhotoUploadUrl`.
- Extend `official_bodies` upsert schema with `accepting_applications` and `application_instructions`.
- No changes to elected-official term lifecycle — approvals just prefill `createTerm` + `swearIn`.
