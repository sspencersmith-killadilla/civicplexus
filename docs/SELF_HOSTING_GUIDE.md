# CivicPlexus Self-Hosting & Deployment Guide

A non-developer can follow this guide end-to-end and stand up a secure, production-ready CivicPlexus deployment — **with or without Lovable** — in roughly two hours. Each section ends with a **Did it work?** check.

CivicPlexus is a full local-government HRIS + talent suite (recruiting, onboarding, core HR, payroll, benefits, performance, compliance), not just an onboarding tool. Plan capacity accordingly.

---

## 1. What you'll end up with

```
                 ┌──────────────────┐
   Users  ─────► │  Cloudflare CDN  │ ──► HTTPS, WAF, rate limiting
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │  SSR runtime     │ ──► TanStack Start app (SSR + API)
                 │  (Workers / Node)│
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
- Cloudflare Workers Paid **or** Render/Fly Starter: ~$5–$20/mo
- Resend or SES: ~$0–$20/mo
- Domain: ~$15/yr
- **Total: ~$35–$70/month**

**Time required: ~2 hours** (plus DNS propagation, up to 24 hours).

---

## 2. Decisions before you start

| Decision | Recommendation | Alternatives |
| --- | --- | --- |
| Database | Supabase Cloud | Self-hosted Supabase on a VM |
| **Deployment target** | **Cloudflare Workers** | Lovable-hosted (one click); generic Node host (Render / Fly.io / Railway); Docker on a VM |
| Domain | One you already own (e.g. `hr.cityofx.gov`) | Buy at registrar of choice |
| Email | Resend (easiest) | AWS SES, SendGrid, Postmark |
| Backups | Supabase automated daily | `pg_dump` to S3 if self-hosted |

This guide covers **every deployment target** in §8.

---

## 3. Accounts to create

Sign up for all of these now and turn on **two-factor authentication** for each:
1. **GitHub** — https://github.com (free)
2. **Supabase** — https://supabase.com (free tier OK to start; upgrade to Pro before go-live)
3. **Your deployment host** — Cloudflare, Render, Fly.io, Railway, or your VM provider
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
git clone https://github.com/<your-org>/civicplexus.git
cd civicplexus
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
7. **Auth → URL Configuration**: set **Site URL** to your final domain (e.g. `https://hr.cityofx.gov`). Add the same to **Redirect URLs**.
8. **Storage**: create these private buckets (leave "Public" off on all of them):
   - `onboarding-documents`
   - `job-applications`
   - `training-evidence`
   - `offer-letters`
   - `payroll-exports`
   - `compliance-exports`

**Did it work?** ✅ `supabase db push` reports "Finished". The Tables UI shows `employees`, `job_requisitions`, `payroll_runs`, `performance_reviews`, etc.

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
   hr.cityofx.gov {
     reverse_proxy localhost:3000
   }
   ```
7. Schedule nightly `pg_dump` to S3/B2:
   ```bash
   0 2 * * * docker exec supabase-db pg_dumpall -U postgres | gzip | aws s3 cp - s3://your-backups/$(date +\%F).sql.gz
   ```
8. **Test the restore** before you go live.

**Did it work?** ✅ `https://hr.cityofx.gov` returns the Supabase Studio login.

---

## 7. Configure secrets

Create `.env.local` in the project root (never commit this file):

```env
# Client-visible (safe to bundle)
VITE_SUPABASE_URL=https://abcd.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGci...
VITE_SUPABASE_PROJECT_ID=abcd

# Server-only (host secrets, never bundle)
SUPABASE_URL=https://abcd.supabase.co
SUPABASE_PUBLISHABLE_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...          # service role — keep secret
LOVABLE_API_KEY=lv_xxx                          # optional — only if AI features are used
BENEFITS_WEBHOOK_SECRET=<32-byte hex>          # openssl rand -hex 32
REMINDERS_CRON_SECRET=<32-byte hex>            # openssl rand -hex 32
EMAIL_FROM=hr@cityofx.gov
RESEND_API_KEY=re_xxx
```

Generate strong secrets with `openssl rand -hex 32`. Store all values in your password manager.

**Did it work?** ✅ `bun run dev` boots and you can sign up locally.

---

## 8. Deploy the app (pick one)

CivicPlexus is built on **TanStack Start v1** with the Vite plugin. The build emits both a static client bundle and a server bundle — you always need an **SSR runtime**. Pure static hosts (plain S3, Netlify static, GitHub Pages) will not work; see §8.D.

### 8.A Cloudflare Workers (recommended, no Lovable)

Fastest, cheapest, globally distributed. Use the `nodejs_compat` flag so server functions can use `fs`, `crypto`, `Buffer`, `stream`, etc. Avoid Node-only npm packages here (sharp, puppeteer, child_process); use Worker-compatible equivalents.

1. `bun add -g wrangler && wrangler login`
2. Build: `bun run build`
3. Set secrets in Cloudflare (run each line):
   ```bash
   for v in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PROJECT_ID \
            SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY \
            LOVABLE_API_KEY BENEFITS_WEBHOOK_SECRET REMINDERS_CRON_SECRET \
            EMAIL_FROM RESEND_API_KEY; do wrangler secret put "$v"; done
   ```
4. Deploy: `wrangler deploy`
5. In Cloudflare DNS, add a CNAME `hr` → `<your-worker>.workers.dev`, then attach a Custom Domain in the Workers UI for automatic TLS.

**Did it work?** ✅ `https://hr.cityofx.gov` returns the sign-in page; `wrangler tail` shows healthy SSR logs.

### 8.B Generic Node host (Render / Fly.io / Railway)

Use this if you prefer a familiar PaaS or need Node-only npm packages.

1. Build locally to confirm: `bun run build`. Output lands in `.output/server/index.mjs`.
2. Add a start script to `package.json` (one-time): `"start": "node .output/server/index.mjs"`.
3. Choose your host:

   **Render** — add a `render.yaml` at the repo root:
   ```yaml
   services:
     - type: web
       name: civicplexus
       runtime: node
       buildCommand: bun install && bun run build
       startCommand: node .output/server/index.mjs
       envVars:
         - key: NODE_VERSION
           value: "20"
   ```

   **Fly.io** — `fly launch --no-deploy`, then in `fly.toml`:
   ```toml
   [build]
     builder = "paketobuildpacks/builder:base"
   [processes]
     app = "node .output/server/index.mjs"
   [[services]]
     internal_port = 3000
     protocol = "tcp"
     [[services.ports]]
       port = 443
       handlers = ["tls", "http"]
   ```

   **Railway** — connect the repo; Railway auto-detects Bun. Set the start command to `node .output/server/index.mjs`. Add a custom domain in the Settings tab.

4. In the host's dashboard, paste **every variable from §7** as an environment variable.
5. Deploy. Logs live in the host's UI.

**Did it work?** ✅ The host's domain returns the sign-in page; deploy logs show no missing env vars.

### 8.C Docker on a VM

Use this for full control or air-gapped environments.

`Dockerfile`:
```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM node:20-alpine AS run
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

`docker-compose.yml` (with Caddy for TLS):
```yaml
services:
  app:
    build: .
    env_file: .env.local
    restart: unless-stopped
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped
volumes:
  caddy_data:
```

`Caddyfile`:
```caddy
hr.cityofx.gov {
  reverse_proxy app:3000
}
```

Bring it up: `docker compose up -d --build`.

**Did it work?** ✅ `curl -I https://hr.cityofx.gov` returns `200`; `docker compose logs app` is clean.

### 8.D Why static hosting will NOT work

CivicPlexus needs an SSR runtime for loaders, server functions, and `/api/*` routes. Do **not** try to deploy to plain S3, Netlify static, Cloudflare Pages without Functions, or GitHub Pages — every authenticated page will fail to render and every API call will 404. If you want a managed static-style experience, use **Cloudflare Pages with Functions** (same Worker runtime as 8.A) or Netlify/Vercel with their SSR adapters.

---

## 9. Email

1. In Resend (or your provider), add your sending domain and add the SPF / DKIM / DMARC DNS records they show you.
2. Verify the domain.
3. Set `EMAIL_FROM` to `hr@yourdomain.gov` and `RESEND_API_KEY` to the API key.

**Did it work?** ✅ Trigger any notification (e.g., create a hire request) — the email lands in your inbox within a minute.

---

## 10. Schedule recurring jobs

CivicPlexus exposes signed cron endpoints under `/api/public/hooks/`. The shared `REMINDERS_CRON_SECRET` from §7 must be sent as a bearer token.

| Endpoint | Schedule | Purpose |
| --- | --- | --- |
| `/api/public/hooks/reminders` | every hour (top of hour) | Send overdue task / approval / certification reminders |
| `/api/public/hooks/reminders?job=cert-expiry` | daily 07:00 local | Cert-expiry digest to managers |
| `/api/public/hooks/reminders?job=retention-sweep` | daily 02:00 local | Delete documents past retention |

**Option A — `pg_cron` (Supabase Cloud):**
```sql
select cron.schedule(
  'civicplexus-reminders', '0 * * * *',
  $$ select net.http_post(
       url := 'https://hr.cityofx.gov/api/public/hooks/reminders',
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret'))
     ) $$
);
```
Then `ALTER DATABASE postgres SET app.cron_secret = '<REMINDERS_CRON_SECRET>';`.

**Option B — generic crontab (any Linux host):**
```cron
0 * * * *  curl -fsS -H "Authorization: Bearer $REMINDERS_CRON_SECRET" https://hr.cityofx.gov/api/public/hooks/reminders
0 7 * * *  curl -fsS -H "Authorization: Bearer $REMINDERS_CRON_SECRET" 'https://hr.cityofx.gov/api/public/hooks/reminders?job=cert-expiry'
0 2 * * *  curl -fsS -H "Authorization: Bearer $REMINDERS_CRON_SECRET" 'https://hr.cityofx.gov/api/public/hooks/reminders?job=retention-sweep'
```

`/api/public/hooks/benefits-callback` is a **webhook**, not cron — the carrier calls it, signed with `BENEFITS_WEBHOOK_SECRET`.

**Did it work?** ✅ After one hour, the audit log shows `cron_run` events.

---

## 11. Create the first admin

1. Sign up at `https://hr.cityofx.gov` with your work email.
2. In Supabase **SQL editor**:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'hr_admin' FROM auth.users WHERE email = 'you@city.gov';
   ```
3. Sign out and back in.

**Did it work?** ✅ Sidebar shows **People**, **Recruiting**, **Pay**, **Performance**, **Compliance**, **Admin** groups.

---

## 12. Security hardening checklist

Tick every item before you let real employees in:

- [ ] **HTTPS forced** + **HSTS** ≥ 6 months on Cloudflare / your CDN.
- [ ] **CSP header** set in `src/routes/__root.tsx` head() (default-src 'self'; img-src 'self' data: https:; etc.).
- [ ] **MFA on every account** (Supabase, host, registrar, email, GitHub).
- [ ] **Supabase service-role key rotated** after initial setup; only in your password manager and host secrets.
- [ ] **Supabase Auth redirect URLs** limited to your domain (no `localhost`, no wildcards).
- [ ] **HIBP password check** enabled.
- [ ] **Cloudflare WAF managed ruleset** ON (or equivalent on your host).
- [ ] **Rate limiting** on `/api/public/*` (60 req/min/IP).
- [ ] **`attachSupabaseAuth` is the only auth middleware** in `src/start.ts` (no duplicates, no replacements).
- [ ] **Every `/api/public/*` route** validates a signature or shared secret before doing work.
- [ ] **`user_roles` is read only via `private.has_role(...)`** in policies — never selected directly from client code.
- [ ] **Backups**: Supabase Pro daily backups, 30-day retention. **Test restore quarterly.**
- [ ] **Audit log** reviewed weekly for first month, monthly thereafter.
- [ ] **Access review** every 90 days — remove stale admin accounts.
- [ ] **Document retention cron** active (daily sweep based on `org_settings.retention_policy`).
- [ ] **Supabase linter** clean: run `supabase db lint` after every migration.
- [ ] **Dependency scan** monthly: `bun audit`.
- [ ] **`.env.local` in `.gitignore`** (it already is — verify).

---

## 13. Compliance notes

| Requirement | How CivicPlexus helps | What you must do |
| --- | --- | --- |
| **I-9 §2** | Captures employee §1 + uploads | In-person verifier signs §2 within 3 business days |
| **W-4 / state withholding** | Form library + signature | Update annually when IRS releases the new form |
| **FLSA exemption** | FLSA Audit page; per-position duties test | Run a duties review whenever a position's responsibilities change |
| **EEO-4** | EEO Snapshot as-of any date | File biennially with EEOC |
| **State new-hire reporting** | New Hire Reports queue + export | Upload to your state agency (TWC in Texas) within statutory window |
| **TCOLE** | Licence + continuing-ed tracking | Submit reporting cycles to TCOLE; investigate gaps |
| **TMRS** | Enrollment + monthly file | Upload monthly file to TMRS portal |
| **FMLA** | Case tracker with entitlement math | Issue WH-380/WH-381 forms; designate eligibility within 5 business days |
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
# then re-deploy via your chosen path in §8
```

**Rollback**: `wrangler rollback` (Workers), redeploy a previous image (Docker), or `git checkout <prev-tag>` then redeploy. For DB, restore the pre-update backup.

---

## 15. Monitoring & alerts

- **Cloudflare Workers** users: Cloudflare Analytics (requests, errors, WAF hits) + `wrangler tail` for live logs.
- **Node host** users: the host's built-in log viewer (Render Logs, Fly `fly logs`, Railway Logs).
- **Docker** users: `docker compose logs -f app`; ship logs to Loki/Datadog if you have one.
- **Supabase Logs**: SQL errors, Auth errors, edge runtime — same across every deploy path.
- **Sentry (free tier)**: add `@sentry/react` and your runtime's adapter with your DSN.
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
4. Point a staging deployment at the restored DB. Sign in. Verify counts: `select count(*) from employees;` matches production.
5. Document time-to-restore.

**Secret rotation runbook:**
1. Generate a new value (`openssl rand -hex 32`).
2. Set it on your host (`wrangler secret put`, Render dashboard, `fly secrets set`, etc.).
3. Redeploy.
4. If rotating `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Settings → API → **Reset service_role**. Update host secret. Redeploy.

---

## 17. Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `Missing Supabase environment variable(s)` | Env var not set on host | List your host's secrets; re-add missing |
| 401 on every server function | Bearer attacher not registered | Verify `attachSupabaseAuth` is in `src/start.ts` `functionMiddleware` |
| `permission denied for table X` | Missing GRANT in a migration | Add `GRANT SELECT, INSERT, UPDATE, DELETE ON public.X TO authenticated;` |
| Sign-in works but sidebar empty | No row in `user_roles` for the user | Run the INSERT in §11 |
| Emails not arriving | Domain not verified | Re-check DNS in Resend |
| pg_cron job stuck | `pg_net` extension missing | `create extension pg_net;` |
| `Unauthorized` on `/api/public/hooks/reminders` | Cron secret mismatch | Re-sync `REMINDERS_CRON_SECRET` host secret with `app.cron_secret` DB setting |
| Build fails citing a `src/server/*` import | Client bundle tried to import server-only code | Move logic into a `*.functions.ts`; never import `*.server.ts` from a route |
| `[unenv] X is not implemented yet!` at runtime | Node-only package on Workers (8.A) | Replace with a Worker-compatible alternative, or switch to 8.B/8.C |
| `Expected 3 parts in JWT; got 1` from PostgREST | Using a `sb_secret_*` service key for public reads | Use the publishable client for public read-only Data API calls |
| Build fails with "Unauthorized" during prerender | A public route's loader calls a protected server fn | Move the call into the component, or put the route under `_authenticated/` |

---

## 18. Appendix

### Full env var reference

| Name | Where | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Client + Server | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client + Server | Publishable (anon) key |
| `VITE_SUPABASE_PROJECT_ID` | Client | Project ref |
| `SUPABASE_URL` | Server only | Same as VITE version |
| `SUPABASE_PUBLISHABLE_KEY` | Server only | Same as VITE version |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | **Secret** — bypasses RLS |
| `LOVABLE_API_KEY` | Server only | Optional — Lovable AI Gateway, only if AI features are used |
| `BENEFITS_WEBHOOK_SECRET` | Server only | HMAC secret for benefits carrier callbacks |
| `REMINDERS_CRON_SECRET` | Server only + DB setting | Auth for cron → reminders endpoint |
| `EMAIL_FROM` | Server only | From-address |
| `RESEND_API_KEY` | Server only | Resend API key |

### DNS records (example)

| Type | Name | Value | Purpose |
| --- | --- | --- | --- |
| CNAME | `hr` | `<your-worker>.workers.dev` (or host's CNAME) | App |
| TXT | `@` | `v=spf1 include:_spf.resend.com -all` | SPF |
| TXT | `resend._domainkey` | (from Resend) | DKIM |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@cityofx.gov` | DMARC |

### Storage bucket policies
All six buckets in §5.8 are private. RLS lets a user read/write only their own folder (`auth.uid()::text = (storage.foldername(name))[1]`) except `payroll-exports` and `compliance-exports`, which are HR-only.

### Cron jobs (default)
- `civicplexus-reminders` — hourly
- `civicplexus-cert-expiry` — daily 07:00 local
- `civicplexus-retention-sweep` — daily 02:00 local
- `civicplexus-demo-reset` — hourly (rolls back demo-user changes older than 24 hours)

### Modules added since 1.0
These ship enabled by default and can be toggled per tenant from `/admin-modules`:
- **Timekeeping** — clock-in/out, OT, comp-time, exempt schedules
- **Public Safety Shifts** — 207(k) work periods, Kelly/Pitman/24-48 rotations
- **HR + Finance** — department FTE budgets and requisition headroom checks
- **Payroll Profiles** — Tyler Munis, BS&A, ADP, Paycom export templates
- **Identity / SCIM** — Entra/Okta SAML + SCIM v2 (`/api/public/scim.v2.Users`)
- **CBA** — union contract registry
- **OSHA** — 300/300A incident log and summary
- **LMS Imports** — external training ingest → TCOLE mapping
- **Cascades** — org-wide directives with AI rollup
- **1-on-1 Templates** — HR-managed question sets
- **ID Badges + QR Verify** — CR80 PDFs, public `/api/public/badge/{serial}`
- **Offline PWA** — service worker (`/sw.js`) with Background Sync against `/api/public/hooks/offline-replay`

### PWA / Background Sync deployment notes
- The build emits `/sw.js` via `vite-plugin-pwa` in `injectManifest` mode (source: `src/sw.ts`).
- `/api/public/hooks/offline-replay` verifies the user's Supabase bearer token before executing queued RPCs — do not place it behind additional auth middleware.
- iOS Safari does not implement Background Sync; the worker falls back to a `drain-queue` `postMessage` while at least one tab is open. Plan field training accordingly.
- `vite.config.ts` denylists `/~oauth`, `/api/`, and `/auth` from the service worker navigation handler. Add any additional auth callback paths to the denylist if you extend the auth flow.

### Cost worksheet
| Item | Monthly |
| --- | --- |
| Supabase Pro | $25 |
| Cloudflare Workers Paid (or Render Starter) | $5–$20 |
| Resend (50K emails) | $20 |
| Domain (amortized) | $1.25 |
| **Total** | **~$51–$66** |

---

You're done. Welcome new hires — and run payroll — with confidence.