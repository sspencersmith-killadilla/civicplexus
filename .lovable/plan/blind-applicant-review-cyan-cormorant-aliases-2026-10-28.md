# Blind applicant review ("Cyan Cormorant" aliases)

## Goal
Hiring managers and reviewers see applicants only by a random alias (color + animal, e.g. "Cyan Cormorant") with a matching colored avatar. Name, email, phone, age, gender, address, photo, and self-ID answers stay hidden until the applicant reaches the interview stage. HR admins can always see everything.

(The NeoGov integration plan is parked as a separate follow-up so this one stays focused.)

## What users will see
- Applicant lists, job pages, compare view, and scoring screens show "Cyan Cormorant" with a cyan animal badge instead of a name.
- Resume and cover letter show with personal details blacked out; download of the original file is hidden until reveal.
- Moving an applicant to **Interview** (or later) reveals their real identity to that job's hiring team. A small note logs who revealed it and when.
- HR admins get a "Show identity" toggle that is logged every time it's used.
- A per-job setting, "Blind review", on by default for new jobs.
- Same treatment for board/commission applications.

## How it works
1. Each application gets a unique alias when submitted (about 30 colors x 60 animals, unique per job).
2. Personal fields move behind a protected lookup: non-HR reviewers can only read them once the application's status is interview or later. This is enforced in the database, not just hidden on screen.
3. Screens read a "safe" view of applicants that returns the alias in place of the name until reveal.
4. Free-text answers and resumes get an AI-assisted redaction pass (names, emails, phones, addresses, dates of birth, pronouns, graduation years) saved as a redacted copy; reviewers see the redacted copy until reveal.
5. Every reveal is written to the audit log.

## Technical details
- Migration: add `alias_color`, `alias_animal`, `identity_revealed_at`, `redacted_cover_letter`, `redacted_answers`, `redacted_resume_path` to `job_applications` and board application submissions; `blind_review boolean default true` on `job_requisitions`.
- Trigger on insert assigns a unique alias per requisition; backfill existing rows.
- Security-definer function `can_view_applicant_identity(app_id)` -> true for HR admins, or when status in (interview, offer, hired) and caller is on the hiring team. Column-level: revoke direct SELECT of PII columns from `authenticated`; expose `job_applications_safe` view (security_invoker) using CASE on that function.
- Trigger on status change to interview sets `identity_revealed_at` and records an audit event.
- Server function (Lovable AI) produces redacted text/resume copy on submission; failures fall back to fully hiding free text until reveal.
- UI: shared `ApplicantAlias` badge component; replace name renders in `jobs.$id.tsx`, `hiring/*`, `admin-officials.applications.*`, compare view, and reports.
- Exclude self-ID (`application_self_id`) from all non-HR access permanently.
- Tests: alias uniqueness per job; reviewer cannot read name before interview; can after; HR always can.

## Out of scope
- Hiding identity from the interviewer after reveal.
- Redacting scanned/image-only resumes (shown as "hidden until interview").
