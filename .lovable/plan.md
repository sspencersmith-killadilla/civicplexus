## Goal

Produce two production-grade guides, written for non-technical readers, and surface them inside the app:

1. **`docs/USER_GUIDE.md`** — setup + daily operations for HR/admin/managers/employees.
2. **`docs/SELF_HOSTING_GUIDE.md`** — soup-to-nuts replication on the reader's own cloud, with secure defaults.

Both shipped as Markdown in the repo, plus a `/help` route in the app that renders them (and a download link for offline/printable copies).

---

## 1. `docs/USER_GUIDE.md` — outline

Plain-English, screenshot placeholders, role-tagged sections.

1. **Welcome & concepts** — what Kyberna is, glossary (worker type, template, task instance, onboarding instance, screening, policy ack, offboarding).
2. **First-time setup (Admin)**
   - Sign in, claim the admin role, invite first HR user.
   - Org Settings → org profile, EIN, branding colors, retention policy JSON (with copy-paste sample), SSO metadata URL.
   - Verify default worker types & seeded templates; how to clone/edit.
   - Configure notification preferences and email sender (link to self-hosting guide for SMTP).
3. **Building workflows**
   - Worker Types page.
   - Templates page → adding/removing tasks, `due_offset_days`, assignee roles (employee/hr/manager/it), task kinds (forms/compliance/provisioning/equipment/training/screening), publishing a version.
   - Forms catalog & form runner; uploading policies.
4. **Daily HR operations**
   - Adding an employee → choose worker type → onboarding instance auto-creates.
   - Preboarding portal link for the new hire.
   - Documents review & e-signatures.
   - Provisioning kanban; equipment/PPE issuance; training assignments & cert expirations.
   - Screenings queue (scheduling, results, attachments).
   - Benefits hand-off & dependents.
   - Policy acknowledgment campaigns and re-ack cadence.
5. **Manager view** — assigned tasks, approvals, team onboarding dashboard.
6. **Employee view** — preboarding checklist, forms, signing policies, viewing pay/benefits links.
7. **Reporting & compliance** — KPI dashboard, CSV exports, audit log filters, what to look at weekly/monthly/quarterly.
8. **Offboarding & rehire** — starting separation, exit checklist, access revocation, rehire clone.
9. **Notifications** — in-app bell, email cadence, overdue reminders cron.
10. **Admin housekeeping** — adding/removing users & roles, rotating API keys (point to self-hosting guide), backup verification cadence.
11. **Troubleshooting** — common errors, "who do I contact", support escalation template.
12. **Appendix** — keyboard shortcuts, accessibility, mobile usage, glossary.

---

## 2. `docs/SELF_HOSTING_GUIDE.md` — outline

Written for a non-developer following step-by-step. Every command copy-pasteable. Each section ends with a "Did it work?" checkbox.

1. **What you'll end up with** — architecture diagram (ASCII), what costs to expect, time required (~2 hours).
2. **Decisions before you start**
   - Domain name you own.
   - Which cloud (recommended: Supabase Cloud + Cloudflare Workers, the same stack Lovable uses). Alternatives noted: self-hosted Supabase on a single VM (Hetzner/DigitalOcean/AWS Lightsail), or AWS/GCP/Azure with managed Postgres.
   - Email provider (Resend / SendGrid / AWS SES).
3. **Accounts to create** — GitHub, Supabase, Cloudflare, domain registrar, email provider. With links and screenshots placeholders.
4. **Get the code**
   - Install Git + Node + Bun (one-line installers per OS).
   - `git clone`, `bun install`.
5. **Provision the database (Supabase Cloud path — recommended)**
   - Create project, copy URL + anon key + service role key + DB password to a password manager.
   - Run migrations via Supabase CLI (`supabase link`, `supabase db push`).
   - Enable Auth providers (Email, Google) and HIBP password check; default redirect URLs.
   - Create storage buckets (`onboarding-documents`, `policy-documents`) — exact settings.
6. **Provision the database (self-hosted Supabase path — optional)**
   - One-VM Docker Compose recipe with `supabase/cli` bootstrap.
   - TLS via Caddy reverse proxy + automatic Let's Encrypt.
   - Daily `pg_dump` to S3-compatible storage; restore drill.
7. **Configure secrets** — list every env var the app needs (split client `VITE_*` vs server-only), with what to paste where. Includes `BENEFITS_WEBHOOK_SECRET`, optional `REMINDERS_CRON_SECRET`.
8. **Deploy the app**
   - **Cloudflare Workers (recommended)**: `wrangler login`, `bun run build`, `wrangler deploy`, bind env vars, attach custom domain, enable Always Use HTTPS.
   - **Alternative — Docker on a VM**: provided `Dockerfile` + `docker-compose.yml` snippet, Caddy in front, systemd unit.
   - **Alternative — Vercel/Netlify**: env var checklist + build command.
9. **Email setup** — DNS records (SPF/DKIM/DMARC) with exact values, verifying domain in Resend/SES, wiring `EMAIL_FROM`.
10. **Cron jobs** — enable `pg_cron`, schedule daily reminders + weekly cert expiry to hit `/api/public/hooks/reminders` with the shared secret.
11. **First admin user** — sign up, then run the supplied SQL snippet to promote yourself to `admin`.
12. **Security hardening checklist** (every item explained):
    - Force HTTPS, HSTS, CSP headers.
    - Rotate Supabase service-role key after setup, store in password manager only.
    - Enable MFA on Supabase, Cloudflare, registrar, email provider.
    - Restrict Supabase Auth redirect URLs to your domain.
    - Turn on Cloudflare WAF managed ruleset + rate-limit `/api/public/*`.
    - Configure backup retention (≥ 30 days) and a tested restore.
    - Audit log review cadence; access review every 90 days.
    - Document retention cron is active.
    - Run `supabase db lint` after every migration.
13. **Compliance notes** — CJIS-eligible storage for screenings, I-9 §2 in-person verification process, retention by US state, WOTC reporting flow, where SSO/SCIM with Entra/Okta plug in later.
14. **Updating the app** — `git pull`, `bun install`, `supabase db push`, `wrangler deploy`. Rollback procedure.
15. **Monitoring & alerts** — Cloudflare analytics, Supabase logs, recommended free-tier Sentry setup, `/healthz` endpoint usage.
16. **Disaster recovery** — RPO/RTO targets, restore-from-backup walkthrough, secret rotation runbook.
17. **Troubleshooting** — table of common errors → fix.
18. **Appendix** — full env var reference, all DNS records, all storage bucket policies, all cron jobs, port list, cost worksheet.

---

## 3. In-app surfacing

- New route `src/routes/_authenticated/help.tsx` with a left nav linking to: User Guide sections, Self-Hosting Guide sections, and **Download Markdown / PDF**.
- Renders the two Markdown files via `react-markdown` + `remark-gfm` (already in tree or add as deps).
- Sidebar entry "Help & Docs" added to `app-shell.tsx`.
- Public mirrors at `/api/public/docs/user-guide.md` and `/api/public/docs/self-hosting.md` (static read of the repo files) so the docs are linkable from outside the app.

---

## 4. Technical notes (for me, not the user)

- Files added: `docs/USER_GUIDE.md`, `docs/SELF_HOSTING_GUIDE.md`, `docs/architecture.txt` (ASCII diagram), `src/routes/_authenticated/help.tsx`, `src/routes/api/public/docs/$file.ts`.
- Dependencies (if missing): `react-markdown`, `remark-gfm`.
- App-shell nav update for "Help & Docs".
- No DB migration, no schema change.
- Screenshot placeholders are `![…](docs/img/placeholder.png)` with a TODO list at top of each guide so the user can drop real screenshots in later.
- Length targets: User Guide ~5–7k words, Self-Hosting ~6–9k words. Both kept under 50KB each.

---

## Out of scope (call out, don't build now)

- Recording actual screenshots/screencasts.
- A polished PDF export pipeline (we ship Markdown + browser print stylesheet only).
- A real installer script (`install.sh`) — can follow in a v2 once the manual stabilizes.

## Question before I build

Do you want both **Cloudflare Workers (recommended)** and **Docker-on-a-VM** paths fully written out, or should I keep just the recommended path and mention the alternative briefly? Full coverage roughly doubles the self-hosting guide length.