
CREATE TABLE public.lms_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('chamilo','moodle','forma')),
  label text NOT NULL,
  base_url text NOT NULL,
  auth_kind text NOT NULL DEFAULT 'api_key' CHECK (auth_kind IN ('api_key','oauth2','basic')),
  username text,
  secret_name text,
  enabled boolean NOT NULL DEFAULT true,
  sync_cursor timestamptz,
  last_sync_at timestamptz,
  last_sync_status text,
  last_error text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lms_connections TO authenticated;
GRANT ALL ON public.lms_connections TO service_role;

ALTER TABLE public.lms_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LMS connections: HR admin all"
  ON public.lms_connections FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::public.app_role));

CREATE TRIGGER update_lms_connections_updated_at
  BEFORE UPDATE ON public.lms_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lms_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES public.lms_connections(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  rows_fetched int NOT NULL DEFAULT 0,
  matched int NOT NULL DEFAULT 0,
  unmatched int NOT NULL DEFAULT 0,
  applied int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  triggered_by text NOT NULL DEFAULT 'manual'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lms_sync_runs TO authenticated;
GRANT ALL ON public.lms_sync_runs TO service_role;

ALTER TABLE public.lms_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LMS sync runs: HR admin read"
  ON public.lms_sync_runs FOR SELECT
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::public.app_role));

CREATE INDEX lms_sync_runs_connection_started_idx
  ON public.lms_sync_runs (connection_id, started_at DESC);

ALTER TABLE public.lms_credit_imports
  ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.lms_connections(id) ON DELETE SET NULL;
