
CREATE TABLE public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  total_rows INT NOT NULL DEFAULT 0,
  processed_rows INT NOT NULL DEFAULT 0,
  inserted INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR admins read their import jobs"
  ON public.import_jobs FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role) AND created_by = auth.uid());

CREATE POLICY "HR admins create their import jobs"
  ON public.import_jobs FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role) AND created_by = auth.uid());

CREATE POLICY "HR admins update their import jobs"
  ON public.import_jobs FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role) AND created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE TRIGGER trg_import_jobs_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_import_jobs_user_created ON public.import_jobs(created_by, created_at DESC);
