# Kyberna Self-Hosting Guide

A non-developer can follow this guide end-to-end and stand up a secure, production-ready Kyberna deployment on their own infrastructure in roughly two hours. Each section ends with a **Did it work?** check.

---

## 1. What you'll end up with

```
                 ┌──────────────────┐
   Users  ─────► │  Cloudflare CDN  │ ──► HTTPS, WAF, rate limiting
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │ Cloudflare Worker│ ──► TanStack Start app (SSR + API)
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │ Supabase Project │ ──► Postgres + Auth + Storage + pg_cron
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │   Email Provider │ ──► Resend / SES / SendGrid
                 └──────────────────┘
```

**Cost estimate (small municipality, < 500 employees):**
- Supabase Pro: ~$25/mo
- Cloudflare Workers Paid: ~$5/mo
- Resend or SES: ~$0–$10/mo
- Domain: ~$15/yr
- **Total: ~$35–$45/month**

**Time required: ~2 hours** (plus DNS propagation, up to 24 hours).

---

## 2. Decisions before you start

| Decision | Recommendation | Alternatives |
| --- | --- | --- |
| Hosting | Supabase Cloud + Cloudflare Workers | Self-hosted Supabase + Docker on a VM |
| Domain | One you already own (e.g. `onboarding.cityofx.gov`) | Buy at registrar of choice |
| Email | Resend (easiest) | AWS SES, SendGrid, Postmark |
| Backups | Supabase automated daily | `pg_dump` to S3 if self-hosted |

This guide covers the **recommended path** in detail and notes the **Docker-on-a-VM alternative** in §6 and §8.

---

## 3. Accounts to create

Sign up for all of these now and turn on **two-factor authentication** for each:
1. **GitHub** — https://github.com (free)
2. **Supabase** — https://supabase.com (free tier OK to start; upgrade to Pro before go-live)
3. **Cloudflare** — https://cloudflare.com (free; Workers Paid plan for production)
4. **Domain registrar** — whoever sold you the domain
5. **Resend** — https://resend.com (free tier OK to start)

**Did it work?** ✅ You can log into all five with MFA enabled.

---

## 4. Get the code

### Install prerequisites
- **macOS**: `brew install git node bun`
- **Windows**: install [Git for Windows](https://git-scm.com), [Node LTS](https://nodejs.org), then in PowerShell: `irm bun.sh/install.ps1 | iex`
- **Linux**: `sudo apt install git nodejs && curl -fsSL https://bun.sh/install | bash`

### Clone and install
```bash
git clone https://github.com/<your-org>/kyberna.git
cd kyberna
bun install
```

**Did it work?** ✅ `bun install` completes without errors.

---

## 5. Provision the database (Supabase Cloud — recommended)

1. https://supabase.com → **New project**. Pick a strong DB password and **save it in a password manager**. Region: closest to your users.
2. Once provisioned, go to **Settings → API** and copy these into your password manager:
   - Project URL (e.g. `https://abcd.supabase.co`)
   - `anon` (publishable) key
   - `service_role` key (treat like a root password — never paste into client code)
3. Install the Supabase CLI: `bun add -g supabase`
4. Link and push migrations:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
5. **Auth → Providers**: enable **Email** and **Google**. For Google, follow the in-product wizard to register OAuth credentials.
6. **Auth → Email**: enable **Have I Been Pwned** password check. Disable **Confirm email** only if you have a closed user base.
7. **Auth → URL Configuration**: set **Site URL** to your final domain (e.g. `https://onboarding.cityofx.gov`). Add the same to **Redirect URLs**.
8. **Storage**: create two private buckets — `onboarding-documents` and `policy-documents`. Leave "Public" off.

**Did it work?** ✅ `supabase db push` reports "Finished". The Tables UI shows `employees`, `worker_types`, etc.

---

## 6. Alternative: self-hosted Supabase on a single VM

Skip if you used §5.

1. Provision a VM (Hetzner CCX23, DigitalOcean 4 vCPU/8 GB, or AWS Lightsail $40 plan).
2. Install Docker + Docker Compose.
3. `git clone https://github.com/supabase/supabase && cd supabase/docker`
4. Copy `.env.example` to `.env`, generate strong values for `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` (use https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys).
5. `docker compose up -d`
6. Install Caddy as a reverse proxy with automatic Let's Encrypt:
   ```caddy
   onboarding.cityofx.gov {
     reverse_proxy localhost:3000
   }
   ```
7. Schedule nightly `pg_dump` to S3/B2:
   ```bash
   0 2 * * * docker exec supabase-db pg_dumpall -U postgres | gzip | aws s3 cp - s3://your-backups/$(date +\%F).sql.gz
   ```
8. **Test the restore** before you go live.

**Did it work?** ✅ `https://onboarding.cityofx.gov` returns the Supabase Studio login.

---

## 7. Configure secrets

Create `.env.local` in the project root (never commit this file):

```env
# Client-visible (safe to bundle)
VITE_SUPABASE_URL=https://abcd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGci...
VITE_SUPABASE_PROJECT_ID=abcd

# Server-only (Cloudflare Worker secrets, never bundle)
SUPABASE_URL=https://abcd.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...          # service role — keep secret
BENEFITS_WEBHOOK_SECRET=<32-byte hex>          # openssl rand -hex 32
REMINDERS_CRON_SECRET=<32-byte hex>            # openssl rand -hex 32
EMAIL_FROM=onboarding@cityofx.gov
RESEND_API_KEY=re_xxx
```

Generate strong secrets with `openssl rand -hex 32`. Store all values in your password manager.

**Did it work?** ✅ `bun run dev` boots and you can sign up locally.

---

## 8. Deploy the app

### 8.A Cloudflare Workers (recommended)

1. `bun add -g wrangler && wrangler login`
2. Build: `bun run build`
3. Set secrets in Cloudflare (run each):
   ```bash
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_PUBLISHABLE_KEY
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put BENEFITS_WEBHOOK_SECRET
   wrangler secret put REMINDERS_CRON_SECRET
   wrangler secret put RESEND_API_KEY
   wrangler secret put EMAIL_FROM
   ```
4. Deploy: `wrangler deploy`
5. Cloudflare Dashboard → **Workers → your-worker → Triggers → Custom Domains** → add `onboarding.cityofx.gov`.
6. Cloudflare **SSL/TLS** → mode **Full (strict)**, **Always Use HTTPS** ON, **HSTS** ON (min 6 months).
7. Cloudflare **Security → WAF** → enable the **Managed Ruleset**.
8. **Rate limiting**: create a rule for `/api/public/*` capped at 60 req/min/IP.

### 8.B Docker on a VM (alternative)

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app/.output /app/.output
CMD ["bun", ".output/server/index.mjs"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    env_file: .env.local
    ports: ["3000:3000"]
    restart: unless-stopped
```

Front with Caddy (same recipe as §6).

### 8.C Vercel / Netlify

Push the repo, set the same env vars in the dashboard, set build command `bun run build`, output `.output/public`. Custom domain via their UI.

**Did it work?** ✅ Your domain serves the Kyberna landing page over HTTPS.

---

## 9. Email setup

1. Resend → **Domains → Add** → enter `cityofx.gov`.
2. Add the SPF, DKIM, and DMARC records Resend shows you to your registrar's DNS. Sample DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@cityofx.gov;`
3. Wait for Resend to verify (5 min – 24 h).
4. Set `EMAIL_FROM` to a verified address.
5. Send a test email from Resend's dashboard.

**Did it work?** ✅ Test email arrives in your inbox, not spam.

---

## 10. Cron jobs

In Supabase **SQL editor**:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Daily overdue-task reminders (06:00 UTC)
select cron.schedule(
  'kyberna-daily-reminders', '0 6 * * *',
  $$select net.http_post(
      url := 'https://onboarding.cityofx.gov/api/public/hooks/reminders',
      headers := jsonb_build_object('x-cron-secret', current_setting('app.cron_secret', true))
    )$$
);

-- Weekly cert-expiry sweep (Mondays 07:00 UTC)
select cron.schedule(
  'kyberna-cert-expiry', '0 7 * * 1',
  $$select net.http_post(
      url := 'https://onboarding.cityofx.gov/api/public/hooks/reminders?kind=cert_expiry',
      headers := jsonb_build_object('x-cron-secret', current_setting('app.cron_secret', true))
    )$$
);

-- Store the shared secret (matches REMINDERS_CRON_SECRET in Worker)
alter database postgres set app.cron_secret = '<paste REMINDERS_CRON_SECRET>';
```

**Did it work?** ✅ `select * from cron.job;` shows both jobs. After 24 h, `select * from cron.job_run_details order by start_time desc limit 5;` shows successful runs.

---

## 11. First admin user

1. Sign up at `https://onboarding.cityofx.gov` with your work email.
2. In Supabase **SQL editor**:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'hr_admin' FROM auth.users WHERE email = 'you@city.gov';
   ```
3. Sign out and back in.

**Did it work?** ✅ Sidebar shows **Workflow**, **Compliance**, **Admin** groups.

---

## 12. Security hardening checklist

Tick every item before you let real employees in:

- [ ] **HTTPS forced** + **HSTS** ≥ 6 months on Cloudflare.
- [ ] **CSP header** set in `src/routes/__root.tsx` head() (default-src 'self'; img-src 'self' data: https:; etc.).
- [ ] **MFA on every account** (Supabase, Cloudflare, registrar, email, GitHub).
- [ ] **Supabase service-role key rotated** after initial setup; only in your password manager and Cloudflare secrets.
- [ ] **Supabase Auth redirect URLs** limited to your domain (no `localhost`, no wildcards).
- [ ] **HIBP password check** enabled.
- [ ] **Cloudflare WAF managed ruleset** ON.
- [ ] **Rate limiting** on `/api/public/*` (60 req/min/IP).
- [ ] **Backups**: Supabase Pro daily backups, 30-day retention. **Test restore quarterly.**
- [ ] **Audit log** reviewed weekly for first month, monthly thereafter.
- [ ] **Access review** every 90 days — remove stale admin accounts.
- [ ] **Document retention cron** active (daily sweep based on `org_settings.retention_policy`).
- [ ] **Supabase linter** clean: run `supabase db lint` after every migration.
- [ ] **Dependency scan** monthly: `bun audit`.
- [ ] **`.env.local` in `.gitignore`** (it already is — verify).

---

## 13. Compliance notes

| Requirement | How Kyberna helps | What you must do |
| --- | --- | --- |
| **I-9 §2** | Captures employee §1 + uploads | In-person verifier signs §2 within 3 business days |
| **CJIS** | Encrypted storage, audit log, RBAC | Use a CJIS-eligible region (AWS GovCloud / Azure Gov); sign CJIS addendum with vendor |
| **WOTC** | Form fields + export | File IRS Form 8850 within 28 days |
| **State retention** | Per-kind retention in `org_settings` | Set retention years per your state's records-retention schedule |
| **SOC2 / NIST 800-53** | Audit log, RBAC, encryption | Inherit Supabase + Cloudflare's SOC2 reports; map controls |
| **SSO / SCIM** | SAML metadata field in Settings | Configure Entra ID or Okta enterprise app; contact support for SCIM activation |

---

## 14. Updating the app

```bash
git pull
bun install
supabase db push     # if there are new migrations
bun run build
wrangler deploy
```

**Rollback**: `wrangler rollback` (Cloudflare) or `git checkout <prev-tag>` then redeploy. For DB, restore the pre-update backup.

---

## 15. Monitoring & alerts

- **Cloudflare Analytics**: requests, errors, WAF hits.
- **Supabase Logs**: SQL errors, Auth errors, edge runtime.
- **Sentry (free tier)**: add `@sentry/react` and `@sentry/cloudflare` with your DSN.
- **`/healthz` endpoint**: configure Better Uptime or UptimeRobot to ping every 5 min and SMS on failure.

---

## 16. Disaster recovery

| Metric | Target |
| --- | --- |
| **RPO** (max data loss) | 24 hours (daily backup) |
| **RTO** (max downtime) | 2 hours |

**Restore drill (run quarterly):**
1. Spin up a fresh Supabase project.
2. Download the latest backup from Supabase → **Database → Backups**.
3. Restore via `psql < backup.sql`.
4. Point a staging Worker at the restored DB. Sign in. Verify counts: `select count(*) from employees;` matches production.
5. Document time-to-restore.

**Secret rotation runbook:**
1. Generate a new value (`openssl rand -hex 32`).
2. `wrangler secret put <NAME>`.
3. Redeploy: `wrangler deploy`.
4. If rotating `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Settings → API → **Reset service_role**. Update Worker secret. Redeploy.

---

## 17. Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `Missing Supabase environment variable(s)` | Env var not set on Worker | `wrangler secret list`; re-add missing |
| 401 on every server function | Bearer attacher not registered | Verify `attachSupabaseAuth` in `src/start.ts` |
| `permission denied for table X` | Missing GRANT in a migration | Add `GRANT SELECT, INSERT, UPDATE, DELETE ON public.X TO authenticated;` |
| Sign-in works but sidebar empty | No row in `user_roles` for the user | Run the INSERT in §11 |
| Emails not arriving | Domain not verified | Re-check DNS in Resend |
| pg_cron job stuck | `pg_net` extension missing | `create extension pg_net;` |
| `Unauthorized` on `/api/public/hooks/reminders` | Cron secret mismatch | Re-sync `REMINDERS_CRON_SECRET` Worker secret with `app.cron_secret` DB setting |

---

## 18. Appendix

### Full env var reference

| Name | Where | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Client + Worker | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client + Worker | Publishable (anon) key |
| `VITE_SUPABASE_PROJECT_ID` | Client | Project ref |
| `SUPABASE_URL` | Worker only | Same as VITE version |
| `SUPABASE_PUBLISHABLE_KEY` | Worker only | Same as VITE version |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker only | **Secret** — bypasses RLS |
| `BENEFITS_WEBHOOK_SECRET` | Worker only | HMAC secret for benefits carrier callbacks |
| `REMINDERS_CRON_SECRET` | Worker only + DB setting | Auth for pg_cron → reminders endpoint |
| `EMAIL_FROM` | Worker only | From-address |
| `RESEND_API_KEY` | Worker only | Resend API key |

### DNS records (example)

| Type | Name | Value | Purpose |
| --- | --- | --- | --- |
| CNAME | `onboarding` | `<your-worker>.workers.dev` | App |
| TXT | `@` | `v=spf1 include:_spf.resend.com -all` | SPF |
| TXT | `resend._domainkey` | (from Resend) | DKIM |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@cityofx.gov` | DMARC |

### Storage bucket policies
Both `onboarding-documents` and `policy-documents` are private. RLS lets a user read/write only their own folder (`auth.uid()::text = (storage.foldername(name))[1]`).

### Cron jobs
- `kyberna-daily-reminders` — 06:00 UTC daily
- `kyberna-cert-expiry` — 07:00 UTC Mondays

### Cost worksheet
| Item | Monthly |
| --- | --- |
| Supabase Pro | $25 |
| Cloudflare Workers Paid | $5 |
| Resend (50K emails) | $20 |
| Domain (amortized) | $1.25 |
| **Total** | **~$51** |

---

You're done. Welcome new hires with confidence.
