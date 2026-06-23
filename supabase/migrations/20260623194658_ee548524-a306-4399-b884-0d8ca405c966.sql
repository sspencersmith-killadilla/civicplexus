ALTER TABLE public.job_requisitions
  ADD COLUMN IF NOT EXISTS posting_sections jsonb NOT NULL DEFAULT '{}'::jsonb;