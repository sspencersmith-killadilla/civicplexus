
-- ============ CBA / Union ============
CREATE TABLE public.bargaining_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bargaining_units TO authenticated;
GRANT ALL ON public.bargaining_units TO service_role;
ALTER TABLE public.bargaining_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read units" ON public.bargaining_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR manages units" ON public.bargaining_units FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.cba_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bargaining_unit_id uuid NOT NULL REFERENCES public.bargaining_units(id) ON DELETE CASCADE,
  name text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  document_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cba_contracts TO authenticated;
GRANT ALL ON public.cba_contracts TO service_role;
ALTER TABLE public.cba_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read contracts" ON public.cba_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR manages contracts" ON public.cba_contracts FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.cba_step_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.cba_contracts(id) ON DELETE CASCADE,
  grade text NOT NULL,
  step int NOT NULL,
  hourly_rate numeric(10,4),
  annual_rate numeric(12,2),
  months_to_next_step int DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, grade, step)
);
GRANT SELECT ON public.cba_step_tables TO authenticated;
GRANT ALL ON public.cba_step_tables TO service_role;
ALTER TABLE public.cba_step_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read steps" ON public.cba_step_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR manages steps" ON public.cba_step_tables FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.cba_longevity_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.cba_contracts(id) ON DELETE CASCADE,
  years_of_service int NOT NULL,
  monthly_amount numeric(10,2),
  annual_amount numeric(12,2),
  percent_of_base numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cba_longevity_rules TO authenticated;
GRANT ALL ON public.cba_longevity_rules TO service_role;
ALTER TABLE public.cba_longevity_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read longevity" ON public.cba_longevity_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR manages longevity" ON public.cba_longevity_rules FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE TABLE public.employee_union_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  bargaining_unit_id uuid NOT NULL REFERENCES public.bargaining_units(id) ON DELETE CASCADE,
  grade text,
  step int,
  step_anniversary_date date,
  longevity_start_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, bargaining_unit_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_union_membership TO authenticated;
GRANT ALL ON public.employee_union_membership TO service_role;
ALTER TABLE public.employee_union_membership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees see own membership" ON public.employee_union_membership FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
         OR private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "HR manages membership" ON public.employee_union_membership FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

-- ============ OSHA ============
CREATE TABLE public.osha_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL UNIQUE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  incident_date date NOT NULL,
  date_recorded date NOT NULL DEFAULT CURRENT_DATE,
  job_title_at_incident text,
  department text,
  where_occurred text,
  description text NOT NULL,
  injury_illness_type text,
  body_part_affected text,
  outcome text CHECK (outcome IN ('death','days_away','restricted_transfer','medical_treatment','first_aid','other')),
  days_away int DEFAULT 0,
  days_restricted int DEFAULT 0,
  privacy_case boolean NOT NULL DEFAULT false,
  recordable boolean NOT NULL DEFAULT true,
  classification text,
  physician_name text,
  physician_facility text,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_osha_year ON public.osha_incidents (date_recorded);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.osha_incidents TO authenticated;
GRANT ALL ON public.osha_incidents TO service_role;
ALTER TABLE public.osha_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages OSHA" ON public.osha_incidents FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "Employees see own incidents" ON public.osha_incidents FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_osha_case_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.case_number IS NULL THEN
    NEW.case_number := 'OSHA-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random()*900000)+100000)::int::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_osha_case_number BEFORE INSERT ON public.osha_incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_osha_case_number();
CREATE TRIGGER tg_osha_updated BEFORE UPDATE ON public.osha_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Saved report snapshots ============
CREATE TABLE public.report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_kind text NOT NULL,
  period_label text NOT NULL,
  generated_by uuid REFERENCES auth.users(id),
  data jsonb NOT NULL,
  artifact_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_snap_kind ON public.report_snapshots(report_kind, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_snapshots TO authenticated;
GRANT ALL ON public.report_snapshots TO service_role;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages snapshots" ON public.report_snapshots FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

-- ============ LMS extensions ============
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS external_provider text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS external_course_id text;

CREATE TABLE public.lms_credit_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  filename text,
  uploaded_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','committed','failed','cancelled')),
  total_rows int NOT NULL DEFAULT 0,
  matched_rows int NOT NULL DEFAULT 0,
  unmatched_rows int NOT NULL DEFAULT 0,
  applied_rows int NOT NULL DEFAULT 0,
  preview jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lms_credit_imports TO authenticated;
GRANT ALL ON public.lms_credit_imports TO service_role;
ALTER TABLE public.lms_credit_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages imports" ON public.lms_credit_imports FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
