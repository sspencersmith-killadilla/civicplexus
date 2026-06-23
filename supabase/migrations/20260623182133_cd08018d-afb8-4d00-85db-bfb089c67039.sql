
ALTER TABLE public.one_on_one_templates
  ADD COLUMN IF NOT EXISTS manager_prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS employee_prompts jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill new columns from legacy agenda_prompts where empty
UPDATE public.one_on_one_templates
   SET manager_prompts = agenda_prompts
 WHERE (manager_prompts IS NULL OR manager_prompts = '[]'::jsonb)
   AND agenda_prompts IS NOT NULL AND agenda_prompts <> '[]'::jsonb;

UPDATE public.one_on_one_templates
   SET employee_prompts = agenda_prompts
 WHERE (employee_prompts IS NULL OR employee_prompts = '[]'::jsonb)
   AND agenda_prompts IS NOT NULL AND agenda_prompts <> '[]'::jsonb;

-- Seed starter templates (idempotent on title)
INSERT INTO public.one_on_one_templates (title, description, agenda_prompts, manager_prompts, employee_prompts, is_default, is_active)
SELECT
  'Standard 1-on-1 Check-in',
  'Quick reciprocal check-in. Both sides answer the same three prompts.',
  '["Successes this week?","Current roadblocks?","Support needed?"]'::jsonb,
  '["Successes this week?","Current roadblocks?","Support needed?"]'::jsonb,
  '["Successes this week?","Current roadblocks?","Support needed?"]'::jsonb,
  true,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.one_on_one_templates WHERE title = 'Standard 1-on-1 Check-in');

INSERT INTO public.one_on_one_templates (title, description, agenda_prompts, manager_prompts, employee_prompts, is_default, is_active)
SELECT
  'Weekly 1-on-1',
  'Weekly leader/employee touchpoint with separate manager and employee prompts.',
  '["What went well this week?","What got in the way?","What do you need from me next week?"]'::jsonb,
  '["What went well this week?","What got in the way?","What do you need from me next week?"]'::jsonb,
  '["What went well this week?","What got in the way?","What do you need from your manager next week?"]'::jsonb,
  false,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.one_on_one_templates WHERE title = 'Weekly 1-on-1');

-- Ensure exactly one default exists
UPDATE public.one_on_one_templates SET is_default = false
 WHERE is_default = true
   AND id <> (SELECT id FROM public.one_on_one_templates WHERE is_default = true ORDER BY created_at ASC LIMIT 1);
