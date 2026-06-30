
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS interview_recording_archive_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS interview_recording_archive_bucket text,
  ADD COLUMN IF NOT EXISTS interview_recording_archive_prefix text;

CREATE TABLE IF NOT EXISTS public.interview_retention_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  previous jsonb NOT NULL DEFAULT '{}'::jsonb,
  next jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.interview_retention_audit TO authenticated;
GRANT ALL ON public.interview_retention_audit TO service_role;
ALTER TABLE public.interview_retention_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retention_audit_hr_read" ON public.interview_retention_audit
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "retention_audit_hr_insert" ON public.interview_retention_audit
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role) AND actor_id = auth.uid());
