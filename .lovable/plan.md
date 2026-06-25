## Goal

Make the demo account a true end-to-end tour: every module has realistic seed data so a visitor signing in as `demo.purpose@testingaccount.test / Demo1234` can click into any feature and see it populated, then exercise the workflows without dead ends.

## Approach

Three layers, all idempotent so the existing 24h auto-revert keeps working:

### 1. Demo seed migration (`seed_demo_fixtures`)
A single SQL migration that, when the demo user exists, populates representative rows across every module so nothing is empty:

- **People & org**: 12–15 employees across 4 departments with supervisors, 3 positions, comp grades, worker types, equipment assignments.
- **Lifecycle**: 1 hire request in approval, 1 preboarding in progress, 1 active offboarding checklist, 1 employee on leave.
- **Recruiting**: 3 posted requisitions (one internal-only), 6 applicants in mixed stages (new / screened / interview scheduled / offer sent / hired / rejected), AI screening suggestions on 3 of them awaiting review, 1 offer pending acceptance, 1 candidate portal token.
- **Performance**: 1 active review cycle with participants at different stages, 1 calibration in progress, goals/OKRs per employee, 2 completed 1-on-1s + 1 upcoming.
- **Compensation**: 1 active comp cycle with proposals, market data rows, FLSA audit findings.
- **PAF / Approvals**: 1 PAF awaiting demo user's approval, 1 approved, 1 returned. Approvals inbox non-empty on first login.
- **Compliance**: TCOLE + TMRS sample records, new-hire checklist, policy campaign in flight with acknowledgements, grievance case.
- **Training**: 2 courses, transcripts, 1 overdue assignment.
- **Payroll & Benefits**: 1 draft payroll run, benefits handoff record.
- **Forms / Docs / Email templates / 1-on-1 templates**: seeded if empty.
- **Notifications**: 5 unread notifications for the demo user spanning module types.
- **Reports / Audit / EEO snapshot**: rely on the above data; verified non-empty.

All inserts are gated `WHERE NOT EXISTS` and tagged so `restore_demo_changes()` ignores them (seeds aren't "demo edits"). Re-running the migration top-ups missing rows without duplicating.

### 2. Guided tour overlay
A lightweight in-app tour (no new dependencies — small custom component using existing Dialog/Popover) that activates only for the demo user:

- Floating "Take the tour" launcher in `AppShell`, dismissible, remembers dismissal in `localStorage`.
- Tour script in `src/lib/demo-tour.ts` lists ~20 stops (Dashboard → Employees → Hire Request → Approvals → PAF → Recruiting → Applicant pool with AI HITL → Offer → Onboarding → Performance → 1-on-1 → Comp cycle → Policies → Training → Reports → Settings → Admin Modules → Admin Demo).
- Each stop = route + short caption + "Next" button. No DOM-coupled spotlighting (brittle); we navigate and explain instead.

### 3. Demo banner + reset button
- Persistent banner for the demo user: "Demo mode — changes revert nightly. [Reset now]".
- Reset-now calls existing `restore_demo_changes()` so testers can hard-reset mid-session without waiting 24h.

### 4. Docs touch-ups
- Add a "Demo walkthrough" section to `docs/USER_GUIDE.md` listing the tour stops and what to try at each (apply for a job, approve a PAF, run AI screening, etc.) so users without the in-app tour have the same path.

## Out of scope

- No new feature work, no schema changes beyond seed data.
- No changes to revert/cron behaviour.
- No third-party tour libraries.

## Technical notes

- Seed migration uses `do $$ ... $$` blocks reading `auth.users` by email to resolve the demo user id; safe no-op if the demo account hasn't been provisioned yet.
- Tour component renders only when `useCurrentUser().email === 'demo.purpose@testingaccount.test'`.
- Banner + reset use the existing `resetDemoChanges` server function (already in `src/lib/demo-account.functions.ts`); add a thin wrapper if one isn't exported.

## Open question

Should the in-app tour auto-launch on the demo user's first login, or stay opt-in via the launcher button? Default in this plan: opt-in, with a one-time toast pointing at the launcher.
