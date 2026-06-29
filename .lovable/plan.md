# Pre-Deployment Gap Analysis — Self-Host Distribution + SOC 2 Posture

Scope: what is missing before a third-party municipality could responsibly install, operate, and audit CivicPlexus on their own infrastructure. Grouped by blocker tier.

---

## Tier 1 — Hard blockers (must ship before first install)

### 1. Installer & upgrade path
- One-command bootstrap script (`scripts/install.sh`) that provisions Supabase locally (or against a customer-owned project), runs migrations in order, seeds roles, creates the first HR admin, and prints next steps.
- Versioned migration manifest + `scripts/upgrade.sh` that runs only pending migrations and refuses to downgrade.
- Health check endpoint at `/api/public/health` returning DB, storage, AI gateway, and cron status (currently absent).
- Docker Compose reference stack (app + Postgres + storage proxy) and a Cloudflare Worker deploy guide as the two supported targets.

### 2. Secrets & configuration story
- Replace hard dependency on Lovable AI Gateway with a pluggable provider: env-driven `AI_PROVIDER=lovable|openai|azure|none` so self-hosters can BYO key or disable AI features entirely.
- Document every required env var in `docs/SELF_HOSTING_GUIDE.md` with a `.env.example` (currently partial).
- Service-role key rotation runbook + signed-URL TTL knobs surfaced in `org_settings`.

### 3. Backup, restore, DR
- `scripts/backup.sh` (pg_dump + storage bucket sync) and `scripts/restore.sh` with verification step.
- Documented RPO/RTO targets and a quarterly restore-test checklist.
- Storage bucket lifecycle rules (employee photos, resumes, offer letters, payroll exports) — none defined today.

### 4. Identity & SSO completeness
- SAML SSO is scaffolded; finish: SP metadata download, IdP-initiated login test, JIT user + role mapping rules, "break-glass" local admin account that survives SSO outage.
- SCIM is scaffolded as a route; needs bearer-token auth, rate limit, and conformance test against Entra ID + Okta.
- MFA enforcement toggle per role (HR admin + Super admin must be `required`).

### 5. Tenant data isolation review
- Confirm every `public.*` table has RLS enabled AND a GRANT block (the project already follows this — needs a CI check: `scripts/check-rls.sql` that fails the build if a new table lacks both).
- Add a Postgres role audit migration that logs every `SECURITY DEFINER` function and its `search_path`.

---

## Tier 2 — SOC 2 posture (CC-series control coverage)

### 6. Audit & evidence
- Centralized audit log already exists (`audit_events`, `paf_audit`) but is not exportable. Add nightly signed-JSON export to `compliance-exports` bucket with retention policy.
- Per-user access review report (who has `hr_admin` / `super_admin`, last login, last action) — currently no UI.
- Login event capture (Supabase auth logs → `auth_events` table mirror) for "who signed in, from where, when".

### 7. Change management
- Migration approval workflow doc + PR template requiring: migration name, rollback SQL, RLS impact note.
- Release notes generator from git history (`scripts/release-notes.sh`) so customers see what changed each upgrade.

### 8. Vendor / sub-processor inventory
- `/admin/subprocessors` page listing every external service (Supabase, Cloudflare, Lovable AI, Resend, etc.) with purpose, data categories, and DPA link. Required for SOC 2 vendor management and for customer trust pages.

### 9. Incident response
- `docs/INCIDENT_RESPONSE.md` with severity matrix, on-call rotation template, customer notification timelines (72h breach notification).
- In-app "Report security issue" link in footer pointing to `security@` mailbox.

### 10. Data retention & deletion
- Per-entity retention policy table (`retention_policies`) with cron-driven purge for: terminated employees (statutory minimum per Texas Local Gov Code 201.005), applicant records (EEOC 1 yr / 2 yr if federal contractor), audit logs (7 yr SOC 2 recommendation).
- "Right to deletion" workflow for non-employee data (rejected applicants).

---

## Tier 3 — Operational completeness

### 11. Observability
- Structured request logging in `src/server.ts` (currently catches errors but doesn't emit metrics).
- Error reporting hook (Sentry or PostHog) — env-pluggable, off by default.
- Slow-query digest job using existing `supabase--slow_queries`.

### 12. Accessibility & i18n
- WCAG 2.1 AA pass: keyboard nav audit on PAF, approvals, timekeeping; color contrast audit on the careers page custom-HTML editor (currently lets admins inject inaccessible markup — add a lint step).
- Texas municipalities increasingly need Spanish; add i18n scaffolding (`react-i18next`) with English baseline + Spanish stubs for employee-facing pages (My HR, Careers, Offer Letter, Candidate Portal).

### 13. Email deliverability
- SPF/DKIM/DMARC setup guide for the customer's sending domain.
- Bounce/complaint webhook handler under `/api/public/hooks/email-events`.

### 14. Test coverage
- Vitest exists (`tests/paf-logic.test.ts`) — extend to: RLS policy tests (run as anon, authenticated, hr_admin), timekeeping OT math, 207(k) thresholds, comp-time ledger, offline replay endpoint signature handling.
- Add Playwright smoke suite (`tests/e2e/`) covering: sign-in, create requisition → post, submit PAF → approve, clock in/out, leave request → approval.
- CI workflow file (`.github/workflows/ci.yml`) running typecheck + tests + RLS lint on PR.

### 15. Administrative UX gaps
- First-run wizard at `/admin/setup` that walks a new install through: org name, fiscal year start, default approval chain, first HR admin invite, AI provider choice.
- Bulk employee import already exists; add bulk **termination** + bulk **department reassignment** for org restructures.
- Notification preferences per user (email vs in-app vs both) — table exists but no UI.

### 16. Documentation
- `docs/ADMIN_RUNBOOK.md` (daily/weekly/monthly tasks).
- `docs/SECURITY_OVERVIEW.md` for the customer's CISO (RLS model, role matrix, encryption-at-rest assertions, sub-processors).
- API reference for `/api/public/*` endpoints (SCIM, badge verify, offline replay, webhooks) — needed by integrators.

---

## Suggested build order (8 sprints, roughly)

```text
Sprint 1-2  Installer, upgrade script, .env.example, health endpoint, backup/restore
Sprint 3    AI provider pluggability + first-run wizard
Sprint 4    SSO/SCIM finish + MFA enforcement + break-glass admin
Sprint 5    Audit export, access review report, retention policies + purge cron
Sprint 6    Observability, email DMARC guide, sub-processor page
Sprint 7    Test coverage (RLS, Playwright, CI)
Sprint 8    Accessibility pass, i18n scaffolding, admin runbook + security overview docs
```

---

## What I'd build first if you approve

Tier 1 items 1–3 (installer, env story, backup/restore) — without these, nobody can install it, and nothing else in the list matters yet. Say the word and I'll start with the install script + `.env.example` + health endpoint in one pass.
