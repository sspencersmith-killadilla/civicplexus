ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS first_run_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_run_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS ai_model text;

-- Ensure a singleton row exists so the wizard can update it.
INSERT INTO public.org_settings (org_name, singleton)
SELECT 'My Organization', true
WHERE NOT EXISTS (SELECT 1 FROM public.org_settings WHERE singleton = true);

-- Allow any signed-in user to read whether setup is complete, but actual update
-- still requires hr_admin via existing policies.
CREATE OR REPLACE FUNCTION public.first_run_status()
RETURNS TABLE(complete boolean, org_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT first_run_complete, org_name
  FROM public.org_settings
  WHERE singleton = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.first_run_status() TO anon, authenticated;