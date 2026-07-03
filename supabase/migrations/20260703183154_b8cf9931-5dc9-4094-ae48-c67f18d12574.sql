
ALTER TABLE public.job_applications 
  ADD COLUMN IF NOT EXISTS internal_resume_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS confidential_until_finalist boolean NOT NULL DEFAULT false;
