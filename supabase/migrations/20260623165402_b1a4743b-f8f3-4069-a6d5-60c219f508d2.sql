
-- 1. extend existing tables
ALTER TABLE public.worker_types ADD COLUMN IF NOT EXISTS is_peace_officer boolean NOT NULL DEFAULT false;
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS tmrs_member_rate_pct numeric(5,2);
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS tmrs_employer_match_pct numeric(5,2);

-- 2. new hire reports (TWC — Texas Attorney General)
CREATE TABLE public.new_hire_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  hire_date date NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  batch_id uuid,
  submitted_at timestamptz,
  ack_received_at timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','batched','submitted','acknowledged','error')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, hire_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_hire_reports TO authenticated;
GRANT ALL ON public.new_hire_reports TO service_role;
ALTER TABLE public.new_hire_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages new hire reports" ON public.new_hire_reports FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER tg_nhr_updated BEFORE UPDATE ON public.new_hire_reports FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.new_hire_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  file_path text,
  file_hash text,
  employee_count integer NOT NULL DEFAULT 0,
  generated_by uuid REFERENCES auth.users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_hire_batches TO authenticated;
GRANT ALL ON public.new_hire_batches TO service_role;
ALTER TABLE public.new_hire_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages new hire batches" ON public.new_hire_batches FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- trigger: queue a new-hire report when an employee becomes active
CREATE OR REPLACE FUNCTION public.tg_queue_new_hire_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active'::employee_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.new_hire_reports (employee_id, hire_date)
    VALUES (NEW.id, COALESCE(NEW.start_date, CURRENT_DATE))
    ON CONFLICT (employee_id, hire_date) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_emp_queue_nhr AFTER INSERT OR UPDATE OF status ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.tg_queue_new_hire_report();

-- 3. TMRS
CREATE TABLE public.tmrs_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  member_rate_pct numeric(5,2) NOT NULL,
  enrolled_on date NOT NULL,
  exited_on date,
  member_id_external text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tmrs_enrollments TO authenticated;
GRANT ALL ON public.tmrs_enrollments TO service_role;
ALTER TABLE public.tmrs_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages tmrs enrollments" ON public.tmrs_enrollments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "Employees can view own tmrs enrollment" ON public.tmrs_enrollments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = tmrs_enrollments.employee_id AND e.user_id = auth.uid()));
CREATE TRIGGER tg_tmrs_enr_updated BEFORE UPDATE ON public.tmrs_enrollments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.tmrs_monthly_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  file_path text,
  file_hash text,
  total_gross numeric(14,2) NOT NULL DEFAULT 0,
  total_member_contrib numeric(14,2) NOT NULL DEFAULT 0,
  total_employer_contrib numeric(14,2) NOT NULL DEFAULT 0,
  employee_count integer NOT NULL DEFAULT 0,
  variance_pct numeric(6,2),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','prepared','signed_off','submitted','locked')),
  prepared_by uuid REFERENCES auth.users(id),
  prepared_at timestamptz,
  signed_off_by uuid REFERENCES auth.users(id),
  signed_off_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tmrs_monthly_files TO authenticated;
GRANT ALL ON public.tmrs_monthly_files TO service_role;
ALTER TABLE public.tmrs_monthly_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages tmrs files" ON public.tmrs_monthly_files FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE TRIGGER tg_tmrs_files_updated BEFORE UPDATE ON public.tmrs_monthly_files FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.tmrs_file_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.tmrs_monthly_files(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  gross numeric(14,2) NOT NULL DEFAULT 0,
  member_contrib numeric(14,2) NOT NULL DEFAULT 0,
  employer_contrib numeric(14,2) NOT NULL DEFAULT 0,
  record_type text NOT NULL DEFAULT 'payroll' CHECK (record_type IN ('payroll','adjustment')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tmrs_file_lines TO authenticated;
GRANT ALL ON public.tmrs_file_lines TO service_role;
ALTER TABLE public.tmrs_file_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages tmrs lines" ON public.tmrs_file_lines FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- 4. TCOLE
CREATE TABLE public.tcole_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  license_number text NOT NULL,
  license_level text NOT NULL CHECK (license_level IN ('basic','intermediate','advanced','master')),
  issued_on date NOT NULL,
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  required_hours integer NOT NULL DEFAULT 40,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, license_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tcole_licenses TO authenticated;
GRANT ALL ON public.tcole_licenses TO service_role;
ALTER TABLE public.tcole_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages tcole licenses" ON public.tcole_licenses FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "Officers view own license" ON public.tcole_licenses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = tcole_licenses.employee_id AND e.user_id = auth.uid()));
CREATE TRIGGER tg_tcole_lic_updated BEFORE UPDATE ON public.tcole_licenses FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.tcole_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  license_id uuid REFERENCES public.tcole_licenses(id) ON DELETE SET NULL,
  topic text NOT NULL CHECK (topic IN ('legislative_update','cultural_diversity','de_escalation','crisis_intervention','use_of_force','arrest_search_seizure','firearms','racial_profiling','human_trafficking','other')),
  course_title text NOT NULL,
  hours numeric(5,2) NOT NULL,
  completed_on date NOT NULL,
  certificate_url text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tcole_completions TO authenticated;
GRANT ALL ON public.tcole_completions TO service_role;
ALTER TABLE public.tcole_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR manages tcole completions" ON public.tcole_completions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "Officers view own completions" ON public.tcole_completions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = tcole_completions.employee_id AND e.user_id = auth.uid()));

-- 5. storage policies for compliance-exports bucket
CREATE POLICY "HR reads compliance exports" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'compliance-exports' AND private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "HR writes compliance exports" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'compliance-exports' AND private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "HR updates compliance exports" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'compliance-exports' AND private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "HR deletes compliance exports" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'compliance-exports' AND private.has_role(auth.uid(), 'hr_admin'::app_role));
