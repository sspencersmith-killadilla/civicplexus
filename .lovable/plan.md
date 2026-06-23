## Goal

Both guides currently describe CivicPlexus as a municipal **onboarding** tool. The app is actually a full local‑government **HRIS + talent suite** (ATS, core HR, payroll, benefits, comp, performance, policies, leave, grievances, FLSA/EEO, TCOLE/TMRS, offboarding, docs, equipment, training, reports). The homepage was already reframed; the docs need to catch up. The user also wants the self‑hosting guide to cover deploying **without Lovable**.

Only the two markdown files are touched. No app code, schema, or routes change.

---

## 1. `docs/USER_GUIDE.md` — rewrite

Keep the friendly tone and "no technical background required" framing. Restructure around the actual product pillars instead of just onboarding.

New section outline:

1. **Concepts at a glance** — expand the glossary: Requisition, Application, Offer, PAF, Pay Grade, Comp Cycle, Review Cycle, Goal, Cascade, 1:1, Policy Campaign, Grievance, FMLA case, TCOLE license, TMRS enrollment, Provisioning Request, Audit Event.
2. **First‑time setup (Admin)** — claim `hr_admin`, org settings, pay calendars/groups, worker types, departments, retention policy, SSO, email sender, Google auth.
3. **Recruit & Hire** — hire requests → requisitions → public careers page + internal careers → applications, screenings, interviews + feedback, offers (token portal), candidate messaging.
4. **Onboard & Provision** — templates, task instances, preboarding portal, forms library + signatures, provisioning kanban, equipment/PPE, new‑hire batches, new‑hire reporting.
5. **Core HR & Records** — employees, positions, PAFs and approval chains, documents, doc templates and generator, my‑HR self‑service.
6. **Pay & Benefits** — pay grades, market ranges, comp cycles + calibration, employee comp history, pay calendars/groups/periods, payroll runs + export profiles, benefits hand‑off + dependents.
7. **Perform & Develop** — goals + cascades + updates, review cycles + calibration, performance reviews + signatures, 1:1s (agenda, notes, action items), training courses, employee training, certifications + expiry, transcripts.
8. **Comply & Govern** — policies + campaigns + acknowledgments, FLSA audit, EEO snapshot, TCOLE, TMRS, FMLA cases, grievances (intake, tasks, events, resolution), new‑hire reports, audit log, reports.
9. **Roles & permissions matrix** — table: `hr_admin`, `hiring_manager`, `supervisor`, `it_admin`, `manager`, `employee`, `candidate` × what each can see/do.
10. **Daily / weekly / monthly cadence** — keep the existing table, extend to cover payroll close, comp cycle gates, review cycle milestones, cert expiry, policy campaigns.
11. **Notifications**, **Offboarding & rehire**, **Troubleshooting**, **Accessibility / Mobile**, **Glossary** — keep, refresh wording.

Drop wording that implies the product is only onboarding. Keep all existing `INSERT INTO public.user_roles …` snippets but route the user to **Cloud → Database → SQL editor** (Lovable Cloud) **or** Supabase SQL editor (self‑host) — the guide should read the same for both audiences.

---

## 2. `docs/SELF_HOSTING_GUIDE.md` — rewrite

Keep the "non‑developer, ~2 hours, **Did it work?** checks" structure and the cost/architecture diagram. Updates:

- §1 architecture diagram and cost: keep, add a note that the app is a full HRIS, not just onboarding.
- §2 decisions table: add a **Deployment target** row with options: Lovable‑hosted (default), Cloudflare Workers, generic Node host (Render / Fly.io / Railway / VPS), Docker on a VM.
- §4 prerequisites: keep.
- §5 Supabase Cloud provisioning: keep, expand storage bucket list to match the real project — `onboarding-documents`, `job-applications`, `training-evidence`, `offer-letters`, `payroll-exports`, `compliance-exports` (all private).
- §6 self‑hosted Supabase: keep.
- §7 secrets: refresh `.env.local` to match the real env contract from `<server-functions-modern>` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, server‑side `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` (AI Gateway, optional — only if AI features used), `BENEFITS_WEBHOOK_SECRET`, `REMINDERS_CRON_SECRET`, `EMAIL_FROM`, `RESEND_API_KEY`.
- **§8 Deploy the app — rewrite with four paths, all without Lovable:**
  - **8.A Cloudflare Workers** (current recommended). Keep `wrangler` flow; add note that the app is TanStack Start v1 with the Vite plugin so no `entry-client`/`entry-server` files are needed and `nitro.preset = cloudflare-module` is the build target.
  - **8.B Generic Node host (Render / Fly.io / Railway).** `bun run build` → `node .output/server/index.mjs`; set the same env vars in the host's dashboard; expose port `3000`; add a `Procfile`/`fly.toml`/`render.yaml` snippet. Note Worker‑runtime caveats only apply to 8.A — Node hosts can use any Node‑only npm package.
  - **8.C Docker on a VM.** Sample `Dockerfile` (multi‑stage: `oven/bun` build → `node:20-alpine` runtime running `.output/server/index.mjs`) and `docker-compose.yml` pairing it with Caddy for TLS. Cron via host `cron` hitting `/api/public/hooks/reminders` with the shared secret.
  - **8.D Static + serverless split is NOT supported** — call this out: TanStack Start needs an SSR runtime; do not try to deploy to plain S3/Netlify static hosting.
- §9 email: keep.
- §10 cron: expand — list every `/api/public/hooks/*` endpoint that needs to be hit on a schedule (reminders, cert expiry, retention sweep, benefits callback is webhook not cron) with example `pg_cron` SQL and an equivalent generic crontab block for non‑Supabase setups.
- §11 first admin: keep.
- §12 security hardening: keep, add bullets — verify `attachSupabaseAuth` is the only auth middleware in `src/start.ts`; verify every public `/api/public/*` route validates a signature or shared secret; verify `user_roles` is read only via `private.has_role`; rotate `SUPABASE_SERVICE_ROLE_KEY` after handoff.
- §13 compliance: extend to mention TCOLE, TMRS, FLSA exemption audit, EEO‑4 snapshot, new‑hire reporting (state TWC), FMLA tracking — what the app gives you vs what you must still do.
- §14 updates: keep.
- §15 monitoring: keep, add note that Workers logs live in Cloudflare; Node hosts use the host's log viewer.
- §16 DR: keep.
- §17 troubleshooting: append rows for "build fails citing `src/server/*` import" → import protection; "`createServerFn` 401 in prod" → `attachSupabaseAuth` missing; "`Expected 3 parts in JWT; got 1`" → using `sb_secret_*` key with PostgREST, switch to publishable client for public reads.
- §18 appendix env‑var table: refresh to match §7.

---

## 3. "Is it ready to deploy?" — short answer at end of chat

After the doc edits, give the user a 6‑line pre‑deploy checklist tied to what's actually in the repo:

1. Migrations applied and `supabase db lint` clean.
2. `attachSupabaseAuth` registered in `src/start.ts`.
3. Required secrets present in the target environment (list from §7).
4. At least one `hr_admin` row in `user_roles`.
5. Cron endpoints reachable and signed with `REMINDERS_CRON_SECRET`.
6. `bun run build` succeeds locally and `security--get_scan_results` shows no unresolved critical findings.

This is advisory — actual publish stays a separate user action.

---

## Out of scope

- No code changes, no migrations, no route changes.
- No screenshots added (the guide already notes `docs/img/` placeholders).
- No new doc files beyond the two edited.
