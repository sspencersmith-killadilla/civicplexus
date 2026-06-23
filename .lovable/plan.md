## What you'll get

1. The `one_on_one_templates` table extended so each template carries **separate manager and employee prompt lists** (matching your reference repo's `questions` + `employee_questions` shape), plus the existing title/description.
2. The **two templates from your repo seeded verbatim** into the DB.
3. An **HR-admin CRUD page** at `/settings/one-on-one-templates` to create, edit, duplicate, deactivate, and set-default templates.

## One blocker I need from you

In the reference repo the templates aren't in source code — they live in that project's Supabase `templates` table (the code only ships a 3-question fallback). I can't read your other project's database. To seed verbatim I need the rows. Either:

- Paste the two templates (title + manager questions list + employee questions list) into chat, **or**
- Run this in your reference project and paste the JSON: `select template_title, questions, employee_questions from templates;`

If you'd rather move forward now, I'll seed with the repo's `DEFAULT_TEMPLATE` ("Standard 1-on-1 Check-in" with the 3 generic prompts) as templates #1 and #2 placeholders, and you can edit them in the admin UI as soon as it lands.

## Schema change

Add two `jsonb` columns to `public.one_on_one_templates`:

- `manager_prompts jsonb not null default '[]'` — list of strings shown to manager
- `employee_prompts jsonb not null default '[]'` — list of strings shown to employee

Keep `agenda_prompts` for backward compatibility; backfill it from `manager_prompts` so existing one-on-ones still render. Existing RLS (HR write, authenticated read) and the `updated_at` trigger stay.

## Seed

Insert two rows (verbatim content from you, or the DEFAULT_TEMPLATE fallback). Mark the first `is_default = true`.

## Admin UI — `/settings/one-on-one-templates`

Gated under `_authenticated/` and guarded in the component with a `has_role('hr_admin')` check (non-admins see "Access denied"). Built with shadcn primitives already in the project.

- **List view**: table of templates (title, default badge, active toggle, last updated, prompt counts). Buttons: New, Edit, Duplicate, Delete (confirm), Set default.
- **Editor (dialog or side route)**: fields for title, description, two ordered prompt lists (manager / employee) with add / remove / drag-reorder, active + default toggles. Save = upsert via Supabase client (RLS enforces HR-admin write).
- Reachable from existing 1:1 module nav.

## Renderer alignment

Where one-on-ones render the agenda today, branch on role: managers see `manager_prompts`, employees see `employee_prompts`. Falls back to `agenda_prompts` when the new columns are empty (covers older templates).

## Technical notes

- Files added: `src/routes/_authenticated/settings/one-on-one-templates.tsx`, `src/components/one-on-one/TemplateEditor.tsx`.
- Files touched: 1:1 meeting/agenda component(s) for the role-based prompt branch; nav link in settings.
- Migration: column adds + backfill + seed insert in one approved migration.
- No new dependencies. Uses existing `dnd-kit` if installed, otherwise simple up/down arrows.

**Please confirm the seed content path** (paste templates, run the export query, or use the placeholder fallback), then I'll switch to build mode and ship it.