# Improvements plan

Grouped by area. Each item lists what changes and where.

## 1. Equipment assignment workflow
Make issue → return explicit instead of ad-hoc rows.
- Equipment page: dedicated "Assign" dialog (employee picker, item picker with stock check, size from `ppe_sizing`, expected return date, notes) and a "Return" action on any open issuance (records return date, condition, restocks catalog qty).
- Status column ("Assigned / Returned / Overdue") derived from `equipment_issuance` dates.
- Employee profile: "Issued equipment" panel with same assign/return controls scoped to that employee.
- Offboarding checklist auto-seeds a "Collect equipment" task listing every open issuance for the separating employee.

## 2. SQL Reports: AI helper + schema map
On `/admin-sql-reports`:
- New right-side "AI helper" panel with three modes:
  - **NL → SQL**: prompt box → drafts a SELECT into the editor (never auto-runs).
  - **Explain**: summarizes current editor SQL in plain English.
  - **Fix**: takes the last run error + SQL, proposes a corrected query.
  All calls go through a new `sqlAssist` server fn using Lovable AI Gateway (`openai/gpt-5.5`), scoped to `hr_admin`, with the schema (from existing `getReportSchema`) injected as system context. Read-only guardrails unchanged.
- New "Schema map" tab: interactive ER diagram rendered with `reactflow` from `getReportSchema` output (tables as nodes, columns listed, FKs as edges). Zoom/pan, click a table to insert `select * from <t> limit 100;` into the editor.

## 3. Interview Kits → under Hiring, with side nav
- Move route `/_authenticated/interview-kits` → `/_authenticated/hiring/interview-kits` (redirect old path).
- Introduce a Hiring layout `src/routes/_authenticated/hiring/route.tsx` with a shadcn `Sidebar` listing: Requisitions, Applications, Interviews, Interview Kits, Offers, Hire Requests, Screenings. Existing routes (`jobs.index`, `interviews.index`, `offers.index`, etc.) get thin re-exports under `/hiring/*` so the sidebar drives navigation.
- Top-level "Hiring" nav entry replaces the current scattered links.

## 4. Multi-action PAF with per-action vote
Chosen model: **shared chain, per-action vote**.
- `personnel_actions.after_values` becomes `actions[]` where each action has `{id, action_type, after_values, effective_date, status: pending|approved|denied, decided_by, decided_at, note}`.
- Migration: new `paf_action_lines` table (paf_id, ordinal, action_type, payload jsonb, effective_date, status, decision fields) + GRANTs + RLS mirroring `personnel_actions`. Backfill: one line per existing PAF.
- Approvals UI: each `approval_steps` row shows every action line with individual Approve/Deny + note; step advances only when the approver has decided every line.
- Apply step (`computeApplyPatch`): iterate approved lines, merge patches in effective-date order; skip denied; audit each line separately in `paf_audit`.
- PAF detail page: per-line status chips, "add another action" button in draft.

## 5. Volunteers: skill/interest filters + archive
- Add `volunteers.archived_at timestamptz` (migration).
- Volunteers list gains: multi-select filter for skills, multi-select for interests (from existing `skills`/`interests` arrays on `volunteers`), "Include archived" toggle, per-row Archive/Restore action.
- Same treatment on vendors: add `vendors.archived_at`, filter chips for `service_categories`/tags already on the table, archive toggle + action.
- Archived rows hidden by default from pickers (shift signup, vendor assignment).

## 6. New Email Templates (author from scratch)
`/_authenticated/email-templates` today only edits seeded rows. Add:
- "New template" dialog: name, key (slug, unique), category, subject, body (existing rich editor), sample variables. Writes to `email_templates` with `is_custom = true` (new column).
- Duplicate action on any existing template → creates a custom copy.
- Delete allowed only when `is_custom = true`.
- Template picker across the app (applicant emails, offers, etc.) shows custom + built-in.

## 7. Admin: LMS connections + AI settings (no restart)
- **LMS**: promote existing `lms-imports` page into a full `/admin-lms` with connection CRUD (provider dropdown, base URL, API key stored via `add_secret` per connection, enabled toggle, "Test connection" button, last sync + DLQ). Backed by existing `lms_connections` table.
- **AI settings**: new `/admin-ai-settings` page (hr_admin/it_admin only) with:
  - Global default chat model (dropdown of allow-listed Lovable AI catalog).
  - Per-feature overrides: applicant screening, coaching, SQL helper, interview kit generator, email drafting. Each row: model dropdown + "use default" checkbox.
  - "Bring your own key": provider (OpenAI/Anthropic/OpenRouter) + secret name; when set, server calls route to that provider instead of the Gateway.
- Storage: new `ai_settings` table (single row + `feature_overrides jsonb` + `byok` jsonb, secret refs only). All server AI callers read from this table (cached 30s) — flipping a value takes effect on next request, no rebuild.

## 8. Landing cards → in-app manual
- Render `docs/END_USER_GUIDE.md` inside `/_authenticated/help` using `react-markdown` + `rehype-slug` (auto ids per H2/H3). Left-side TOC, sticky. Bundled at build time via `?raw` import.
- Dashboard cards on `/` get a `helpAnchor` prop; clicking the card title (or a new "?" icon) opens `/help#<anchor>`.
- Add missing sections to the guide for any card that lacks one (Volunteers, PAF, Equipment, SQL Reports, etc.).

## 9. Job posting icon picker
- Add `job_requisitions.icon text` (migration; nullable, defaults to a category-based fallback).
- Requisition create/edit form: `IconPicker` component using a curated Lucide subset (~60 icons: Briefcase, Wrench, Shield, HeartPulse, GraduationCap, Truck, Leaf, …) with search.
- Icon renders on: requisition list, careers listing card, careers detail hero, interview scheduler.

---

## Sequencing
1. Migrations (PAF lines, archived_at, is_custom, ai_settings, job icon) in one batch with grants/RLS.
2. Backend server fns (paf lines, ai settings resolver, email template CRUD, sql AI helper).
3. UI (equipment dialogs, hiring layout + move, volunteer/vendor filters, email builder, help renderer, icon picker, schema map, AI/LMS admin pages).
4. Redirects and nav updates last.

## Out of scope (call out if you want them added)
- Real-time collaborative PAF editing.
- Editing built-in email templates' underlying HTML shell.
- Full-text search across the rendered manual.
