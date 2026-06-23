
ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS cutover_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_mfa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sso_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payroll_bureau text,
  ADD COLUMN IF NOT EXISTS fed_employer_id text;

CREATE TABLE IF NOT EXISTS public.pay_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_groups TO authenticated;
GRANT ALL ON public.pay_groups TO service_role;
ALTER TABLE public.pay_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage pay groups" ON public.pay_groups
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER set_updated_at_pay_groups BEFORE UPDATE ON public.pay_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.pay_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_group_id uuid NOT NULL REFERENCES public.pay_groups(id) ON DELETE CASCADE,
  frequency text NOT NULL CHECK (frequency IN ('weekly','biweekly','semi_monthly','monthly')),
  anchor_period_start date NOT NULL,
  check_date_offset_days int NOT NULL DEFAULT 5,
  cutoff_offset_days int NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_calendars TO authenticated;
GRANT ALL ON public.pay_calendars TO service_role;
ALTER TABLE public.pay_calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage pay calendars" ON public.pay_calendars
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER set_updated_at_pay_calendars BEFORE UPDATE ON public.pay_calendars
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_group_id uuid NOT NULL REFERENCES public.pay_groups(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  check_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','assembled','locked','exported','corrected')),
  locked_at timestamptz,
  locked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pay_group_id, period_start, period_end)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_periods TO authenticated;
GRANT ALL ON public.pay_periods TO service_role;
ALTER TABLE public.pay_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage pay periods" ON public.pay_periods
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER set_updated_at_pay_periods BEFORE UPDATE ON public.pay_periods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.payroll_export_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  bureau text NOT NULL CHECK (bureau IN ('adp','paylocity','paycom','tyler_munis','generic_csv')),
  file_format text NOT NULL CHECK (file_format IN ('csv','fixed_width')),
  column_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  earnings_codes jsonb NOT NULL DEFAULT '{}'::jsonb,
  deduction_codes jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_export_profiles TO authenticated;
GRANT ALL ON public.payroll_export_profiles TO service_role;
ALTER TABLE public.payroll_export_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage export profiles" ON public.payroll_export_profiles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER set_updated_at_payroll_profiles BEFORE UPDATE ON public.payroll_export_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_id uuid NOT NULL REFERENCES public.pay_periods(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.payroll_export_profiles(id) ON DELETE RESTRICT,
  run_kind text NOT NULL DEFAULT 'regular' CHECK (run_kind IN ('regular','correction','off_cycle')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_signoff','signed_off','released','superseded')),
  total_gross numeric(14,2) NOT NULL DEFAULT 0,
  total_hours numeric(12,2) NOT NULL DEFAULT 0,
  headcount int NOT NULL DEFAULT 0,
  file_path text,
  file_hash text,
  prepared_by uuid,
  prepared_at timestamptz,
  signed_off_by uuid,
  signed_off_at timestamptz,
  released_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage payroll runs" ON public.payroll_runs
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER set_updated_at_payroll_runs BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.payroll_run_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  base_annual numeric(12,2),
  hourly_rate numeric(10,4),
  regular_hours numeric(8,2) NOT NULL DEFAULT 0,
  overtime_hours numeric(8,2) NOT NULL DEFAULT 0,
  pto_hours numeric(8,2) NOT NULL DEFAULT 0,
  sick_hours numeric(8,2) NOT NULL DEFAULT 0,
  fmla_hours numeric(8,2) NOT NULL DEFAULT 0,
  one_time_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  gross_pay numeric(12,2) NOT NULL DEFAULT 0,
  warnings text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_run_lines TO authenticated;
GRANT ALL ON public.payroll_run_lines TO service_role;
ALTER TABLE public.payroll_run_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage payroll run lines" ON public.payroll_run_lines
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TABLE IF NOT EXISTS public.migration_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  vendor text NOT NULL,
  expected_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  column_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_sources TO authenticated;
GRANT ALL ON public.migration_sources TO service_role;
ALTER TABLE public.migration_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage migration sources" ON public.migration_sources
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER set_updated_at_migration_sources BEFORE UPDATE ON public.migration_sources
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.migration_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.migration_sources(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (stage IN ('positions','worker_types','employees','managers','comp','leave_balances','certifications','policy_acks')),
  external_key text NOT NULL,
  payload jsonb NOT NULL,
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','created','updated','skipped','failed')),
  outcome_message text,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_job_id, stage, external_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_stages TO authenticated;
GRANT ALL ON public.migration_stages TO service_role;
ALTER TABLE public.migration_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage migration stages" ON public.migration_stages
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_migration_stages_job ON public.migration_stages(import_job_id, stage);

INSERT INTO public.payroll_export_profiles (name, bureau, file_format, column_map, earnings_codes, deduction_codes, notes) VALUES
('ADP Workforce Now', 'adp', 'csv',
 '{"employee_id":"File #","first":"First Name","last":"Last Name","gross":"Regular Earnings","reg_hours":"Regular Hours","ot_hours":"Overtime Hours"}'::jsonb,
 '{"regular":"REG","overtime":"OT","pto":"PTO","sick":"SICK","fmla":"FMLA"}'::jsonb,
 '{}'::jsonb,
 'Standard ADP WFN paydata batch CSV.'),
('Paylocity Web Pay', 'paylocity', 'csv',
 '{"employee_id":"Employee ID","first":"First Name","last":"Last Name","gross":"Earnings Amount","reg_hours":"Hours"}'::jsonb,
 '{"regular":"REG","overtime":"OT","pto":"PTO","sick":"SCK","fmla":"FML"}'::jsonb,
 '{}'::jsonb,
 'Paylocity Web Pay batch import.'),
('Paycom', 'paycom', 'csv',
 '{"employee_id":"Employee Code","first":"First Name","last":"Last Name","gross":"Amount","reg_hours":"Hours"}'::jsonb,
 '{"regular":"R","overtime":"O","pto":"V","sick":"S","fmla":"F"}'::jsonb,
 '{}'::jsonb,
 'Paycom payroll import.'),
('Tyler Munis Payroll', 'tyler_munis', 'fixed_width',
 '{"employee_id":"emp_no","first":"first_name","last":"last_name","gross":"gross_pay","reg_hours":"reg_hrs","ot_hours":"ot_hrs"}'::jsonb,
 '{"regular":"01","overtime":"02","pto":"10","sick":"11","fmla":"12"}'::jsonb,
 '{}'::jsonb,
 'Tyler Munis Payroll fixed-width input.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.migration_sources (name, vendor, expected_files, notes) VALUES
('Tyler Munis HR', 'tyler', '["employees.csv","positions.csv","comp_history.csv","leave_balances.csv","certifications.csv"]'::jsonb, 'Standard Munis HR extracts.'),
('NEOGOV', 'neogov', '["employees.csv","positions.csv","policy_acks.csv"]'::jsonb, 'NEOGOV INSIGHT exports.'),
('BambooHR', 'bamboohr', '["employees.csv","compensation.csv","time_off.csv"]'::jsonb, 'BambooHR standard export.'),
('ADP Workforce Now', 'adp', '["personal.csv","jobs.csv","pay_rates.csv"]'::jsonb, 'ADP WFN exports.'),
('Generic CSV', 'generic', '["employees.csv"]'::jsonb, 'Free-form column mapping.')
ON CONFLICT (name) DO NOTHING;
