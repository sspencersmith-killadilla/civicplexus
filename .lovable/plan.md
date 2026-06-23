## Goal

Replace the existing seed `one_on_one_templates` rows with the 25 templates in the uploaded CSV, preserving theme grouping and both manager / employee question sets.

## Approach

One new migration that:

1. **Adds a `theme` column** (`text`, nullable) to `public.one_on_one_templates` so the "Theme 1: Foundational Check-ins" / etc. grouping from the CSV is preserved and can be shown in the UI later.
2. **Clears existing seed templates** (`DELETE FROM public.one_on_one_templates WHERE title IN (...)` for the current 4 seeds: `Standard 1-on-1 Check-in`, `Weekly 1-on-1`, plus the two from migration `…224736`). Any user-created templates and any `one_on_ones` rows referencing them are preserved (`template_id` is `ON DELETE SET NULL`).
3. **Inserts 25 rows** from the CSV, one per template:
   - `title` ← `template_title` (e.g. "Template 1: The Standard Check-in")
   - `theme` ← `theme_title`
   - `description` ← `theme_title` (so existing UI still shows useful context until a theme column is wired in)
   - `manager_prompts` ← `questions` JSON array
   - `employee_prompts` ← `employee_questions` JSON array
   - `agenda_prompts` ← `questions` (kept in sync for legacy readers)
   - `is_default` = true only for Template 1, false elsewhere
   - `is_active` = true

Insertion uses `INSERT ... ON CONFLICT` isn't possible (no unique on title); we instead `DELETE` the 25 target titles first, then `INSERT` to make the migration idempotent.

## Out of scope

- No UI changes. The templates page already renders `description` and prompt counts; theme grouping in the UI can be a follow-up.
- No changes to `one_on_ones` rows, AI coaching, or reminders.
- No edits to `src/lib`, routes, or types — `theme` is additive and nullable so the generated types file is fine to leave; if typecheck flags it, regenerate or add the column to the types file in the same change.

## Files

- New: `supabase/migrations/<ts>_replace_one_on_one_templates.sql`
- Possibly: `src/integrations/supabase/types.ts` to add `theme` to the row type if typecheck requires it.
