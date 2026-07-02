# Plan: Officials onboarding module

Mirrors the employee onboarding stack (`onboarding_templates` → `template_tasks` → `onboarding_instances` → `task_instances`) but keyed to `official_terms`, with a doc packet tailored to elected/appointed officials and per-body customization. Reuses existing oath/bond fields on `official_terms` and the `official_disclosures` table rather than duplicating them.

## Domain differences from employees

Officials aren't hired the way employees are — they're seated. So:

- Trigger is **creating an active term**, not a hire request.
- No manager relationship. Assignees are the official themselves, the **city clerk**, the **body chair**, **HR**, or **IT**.
- Doc packet centers on: Oath of Office, Statement of Officer, Surety Bond (some seats only), Ethics Acknowledgment, Conflict-of-Interest / Chapter 176 disclosure, TOMA training (required for TX officials within 90 days), PIA training (within 90 days), Financial Disclosure (where applicable), roster publish consent (photo/bio/contact).
- Provisioning is minimal — official email alias, packet portal login, meeting-management access — no equipment issuance, no ID badge on the employee track.
- No conversion of `employees.status` — instead, an instance completing flips the term `status` from `pending` → `active` and stamps `oath_signed_at` if the oath task carries that signal.

## Database (one migration)

New enums:
- `official_task_category`: `oath`, `bond`, `ethics`, `disclosure`, `training`, `policy`, `provisioning`, `orientation`, `other`
- `official_task_assignee`: `official`, `clerk`, `chair`, `hr`, `it`, `automated`

New tables (all with GRANT + RLS in the same statement per the rules):

1. `official_onboarding_templates` — scoped by `body_id` (nullable = default template) and `appointment_type`, with `is_default`, `is_active`. Read: authenticated. Manage: `can_manage_officials`.
2. `official_template_tasks` — `template_id`, `title`, `description`, `category`, `assignee`, `is_required`, `days_offset` (from term `start_date`), `sort_order`, `completion_signal` enum (`none`, `oath_signed`, `bond_filed`, `ethics_ack`, `coi_filed`, `toma_complete`, `pia_complete`, `photo_consent`) — the signal lets a task's completion write back into structured fields on `official_terms` / `official_disclosures`.
3. `official_onboarding_instances` — one per term. `term_id UNIQUE`, `template_id`, `started_at`, `completed_at`, `status` (`active`, `complete`, `cancelled`).
4. `official_task_instances` — per-task state. Mirrors `task_instances`: `status`, `due_date`, `completed_at`, `completed_by`, `evidence_document_id` (references `documents`), `notes`.

RLS:
- Managers (`can_manage_officials`) full CRUD on all four.
- Chair of the seat's body can read + update tasks scoped to their body via a helper `public.can_manage_official_onboarding(_uid, _term_id)`.
- The official (`officials.user_id = auth.uid()`) can read their own instance and update tasks assigned to `official`.

Triggers:
- `tg_official_task_completion` on `official_task_instances` — when a task with `completion_signal` flips to `complete`, writes back to `official_terms` (e.g. `oath_signed_at = now()`, `oath_administered_by = auth.uid()`) or inserts an `official_disclosures` stub row.
- `tg_official_onboarding_progress` — when all required tasks are complete, sets instance `completed_at`/`status = complete`, sets term `status = active` if still `pending`, and notifies the clerk + chair + official.
- `tg_seed_official_onboarding` on `official_terms` INSERT — picks best template (body-specific + appointment-type match → body default → global default) and clones `official_template_tasks` into `official_task_instances` with `due_date = start_date + days_offset`.
- `trg_updated_at` on all four tables.

Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`; no `anon`.

## Seed data (in the same migration)

- **Default template** ("Municipal official — standard onboarding") with tasks: welcome/orientation packet, oath of office (signal: `oath_signed`), Chapter 176 vendor disclosure (signal: `coi_filed`), ethics ordinance ack (signal: `ethics_ack`), TOMA online training (`toma_complete`, due +90d), PIA training (`pia_complete`, due +90d), photo/bio consent (`photo_consent`), meeting-management portal access (assignee: `it`, category: `provisioning`).
- **Council overlay** ("City Council — elected") adds: surety bond filed (signal: `bond_filed`), Personal Financial Statement, executive session confidentiality briefing.
- **P&Z / ZBA overlay** adds: quasi-judicial due-process briefing.
- **Board default** stays lean (no bond, no financial statement).

## Server layer

New file `src/lib/official-onboarding.functions.ts`:

- `listOfficialOnboardingTemplates` — for the manager UI.
- `getOfficialOnboarding({ term_id })` — instance + tasks + evidence links; used by both the clerk view and the official's self-serve page.
- `updateOfficialTaskStatus({ task_id, status, notes?, evidence_document_id? })` — RLS enforces who can update.
- `reseedOfficialOnboarding({ term_id, template_id? })` — clerk-only reset when a template changes.
- `getExpiringOnboarding()` — dashboard widget: overdue tasks + terms past oath deadline.

All follow the `.middleware([requireSupabaseAuth]).inputValidator(...).handler(...)` shape used elsewhere.

## UI

1. **Term detail** (existing `admin-officials` term panel): add an "Onboarding" section — collapsible checklist with grouped tasks by category, per-task complete/mark-done/upload evidence, oath date/administrator display when signal fires.
2. **New route `/_authenticated/admin-officials.onboarding-templates.tsx`** — clerk/HR admin CRUD for templates + tasks (matches the employee `onboarding_templates` editor pattern).
3. **Officials dashboard tile** on `admin-officials.tsx` next to "Terms expiring" — "X onboarding tasks overdue" collapsible mirror of the existing expirations collapsible.
4. **Official self-serve** on the existing signed-in-official page (if the person has `officials.user_id`): "Your onboarding" checklist with the tasks assigned to `official`, upload buttons for evidence, and a completion percentage.

## Storage

Reuse the existing `onboarding-documents` bucket — no new bucket. Add one RLS policy allowing SELECT/INSERT/DELETE on paths under `officials/{term_id}/…` for managers, the assigned official, and the chair. Evidence documents get a `documents` row (existing table) referenced by `evidence_document_id`.

## What's explicitly out of scope for this turn

- Automated e-signature integration (docusign/etc.) — evidence stays as uploaded PDFs.
- LMS integration for TOMA/PIA course auto-completion — the task can be manually marked with an evidence upload; wiring to the existing LMS credit importer can come later.
- Notifications digest / reminder emails beyond the in-app `notifications` insert already triggered on progress.
- Seeding a live onboarding instance for every already-active fictional official (only `pending` terms and any new terms will auto-seed). A companion "Backfill onboarding for existing terms" button on the demo-admin page will be added if you want it — say the word.

## Files touched

- **New migration:** enums, four tables, helper fn, four triggers, three seed templates + tasks, storage policies.
- **New server fns:** `src/lib/official-onboarding.functions.ts`
- **New route:** `src/routes/_authenticated/admin-officials.onboarding-templates.tsx`
- **Edited routes:** `src/routes/_authenticated/admin-officials.tsx` (dashboard tile + link), term-detail panel (onboarding checklist section)

## Two decisions before I start

1. **Backfill:** seed an onboarding instance for every currently-active fictional official (~50), or only auto-seed on new terms going forward? Backfilling gives a fleshed-out demo out of the gate. Not backfilling keeps the migration cheaper.
2. **Chair role:** should the body chair be able to *mark tasks complete* for their board members, or only *view* status? Real cities differ — Texas usually reserves this to the clerk. I'd default to view-only for chairs unless you say otherwise.
