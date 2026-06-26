
-- Identity providers
CREATE TABLE public.identity_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('azure_ad','google_workspace','okta','onelogin','generic_scim')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  domain text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.identity_providers TO authenticated;
GRANT ALL ON public.identity_providers TO service_role;
ALTER TABLE public.identity_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage IdPs" ON public.identity_providers FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER tg_idp_updated BEFORE UPDATE ON public.identity_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SCIM bearer tokens (store sha256 hash only)
CREATE TABLE public.scim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.identity_providers(id) ON DELETE CASCADE,
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scim_tokens TO authenticated;
GRANT ALL ON public.scim_tokens TO service_role;
ALTER TABLE public.scim_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage SCIM tokens" ON public.scim_tokens FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

-- Identity links to external directory
CREATE TABLE public.identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.identity_providers(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  external_user_name text,
  external_email text,
  active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, external_id)
);
CREATE INDEX idx_identity_links_employee ON public.identity_links(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.identity_links TO authenticated;
GRANT ALL ON public.identity_links TO service_role;
ALTER TABLE public.identity_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage identity links" ON public.identity_links FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER tg_idlink_updated BEFORE UPDATE ON public.identity_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Provisioning events (audit + queue for outbound)
CREATE TABLE public.provisioning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.identity_providers(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  action text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','succeeded','failed','skipped')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX idx_provisioning_status ON public.provisioning_events(status, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provisioning_events TO authenticated;
GRANT ALL ON public.provisioning_events TO service_role;
ALTER TABLE public.provisioning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins view provisioning events" ON public.provisioning_events FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "HR admins manage provisioning events" ON public.provisioning_events FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

-- Outbound provisioning hook when employee status changes
CREATE OR REPLACE FUNCTION public.tg_employee_lifecycle_provisioning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _action text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    _action := CASE NEW.status::text
      WHEN 'active' THEN 'enable'
      WHEN 'terminated' THEN 'suspend'
      WHEN 'on_leave' THEN 'suspend'
      WHEN 'preboarding' THEN 'provision'
      ELSE NULL
    END;
    IF _action IS NOT NULL THEN
      INSERT INTO public.provisioning_events (employee_id, direction, action, payload)
      SELECT NEW.id, 'outbound', _action,
             jsonb_build_object('from', OLD.status::text, 'to', NEW.status::text, 'provider_id', il.provider_id)
      FROM public.identity_links il WHERE il.employee_id = NEW.id AND il.active;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_employee_lifecycle_provisioning ON public.employees;
CREATE TRIGGER tg_employee_lifecycle_provisioning
  AFTER UPDATE ON public.employees FOR EACH ROW
  EXECUTE FUNCTION public.tg_employee_lifecycle_provisioning();

-- Position budgets (per fiscal year per department)
CREATE TABLE public.position_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  fiscal_year int NOT NULL,
  budgeted_fte numeric(8,2) NOT NULL DEFAULT 0,
  budgeted_amount numeric(14,2),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department, fiscal_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_budgets TO authenticated;
GRANT ALL ON public.position_budgets TO service_role;
ALTER TABLE public.position_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read budgets" ON public.position_budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR admins manage budgets" ON public.position_budgets FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER tg_pb_updated BEFORE UPDATE ON public.position_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Payroll export built-in templates (separate from per-org profiles)
CREATE TABLE public.payroll_export_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL,
  name text NOT NULL,
  format text NOT NULL CHECK (format IN ('csv','fixed_width','xml')),
  delimiter text DEFAULT ',',
  include_header boolean NOT NULL DEFAULT true,
  column_map jsonb NOT NULL DEFAULT '[]'::jsonb,
  earnings_codes jsonb NOT NULL DEFAULT '{}'::jsonb,
  deduction_codes jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payroll_export_templates TO authenticated;
GRANT ALL ON public.payroll_export_templates TO service_role;
ALTER TABLE public.payroll_export_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read templates" ON public.payroll_export_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR admins manage templates" ON public.payroll_export_templates FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));

-- Seed common municipal payroll vendor templates
INSERT INTO public.payroll_export_templates (vendor, name, format, column_map, earnings_codes, deduction_codes, notes) VALUES
('Tyler Munis','Tyler Munis - Standard Time Import','csv',
 '[{"key":"employee_number","label":"EmployeeNumber"},{"key":"pay_code","label":"PayCode"},{"key":"hours","label":"Hours"},{"key":"rate","label":"Rate"},{"key":"work_date","label":"WorkDate","format":"MM/DD/YYYY"},{"key":"department","label":"Org"},{"key":"project","label":"Project"}]'::jsonb,
 '{"regular":"REG","overtime":"OT","comp_earned":"CTE","comp_used":"CTU","holiday":"HOL","sick":"SCK","vacation":"VAC"}'::jsonb,
 '{}'::jsonb,
 'Tyler Munis standard time import format. Verify org codes match your chart of accounts.'),
('Tyler Munis','Tyler Munis - Payroll Adjustments','csv',
 '[{"key":"employee_number","label":"EmpNo"},{"key":"earnings_code","label":"EarnCd"},{"key":"amount","label":"Amount"},{"key":"hours","label":"Hours"},{"key":"effective_date","label":"EffDate"}]'::jsonb,
 '{"merit_increase":"MER","longevity":"LON","step_increase":"STP","retro":"RTO"}'::jsonb,
 '{}'::jsonb,
 'Adjustment-only feed for merit, longevity, and retro payments.'),
('BS&A','BS&A Software - Payroll Time','csv',
 '[{"key":"employee_id","label":"Employee ID"},{"key":"pay_type","label":"Pay Type"},{"key":"hours","label":"Hours"},{"key":"date","label":"Date"},{"key":"gl_account","label":"GL Account"}]'::jsonb,
 '{"regular":"R","overtime":"O","holiday":"H","sick":"S","vacation":"V"}'::jsonb,
 '{}'::jsonb,
 'BS&A Software payroll time import.'),
('ADP','ADP Workforce Now - Batch Import','csv',
 '[{"key":"company_code","label":"Co Code"},{"key":"batch_id","label":"Batch ID"},{"key":"file_number","label":"File #"},{"key":"earnings_code","label":"Earnings 3 Code"},{"key":"hours","label":"Earnings 3 Hours"},{"key":"amount","label":"Earnings 3 Amount"}]'::jsonb,
 '{"regular":"REG","overtime":"O/T","holiday":"HOL","sick":"SCK","vacation":"VAC"}'::jsonb,
 '{}'::jsonb,
 'ADP Workforce Now standard batch import template.'),
('Paycom','Paycom - Time Import','csv',
 '[{"key":"employee_code","label":"Employee_Code"},{"key":"date","label":"Date"},{"key":"hours","label":"Hours"},{"key":"earning_code","label":"Earning_Code"},{"key":"department","label":"Department_Code"}]'::jsonb,
 '{"regular":"REG","overtime":"OT","holiday":"HOL","sick":"SCK","vacation":"VAC"}'::jsonb,
 '{}'::jsonb,
 'Paycom time import format.'),
('Generic','Generic CSV - All Fields','csv',
 '[{"key":"employee_number","label":"employee_number"},{"key":"employee_name","label":"employee_name"},{"key":"department","label":"department"},{"key":"pay_code","label":"pay_code"},{"key":"hours","label":"hours"},{"key":"rate","label":"rate"},{"key":"amount","label":"amount"},{"key":"work_date","label":"work_date"}]'::jsonb,
 '{"regular":"REG","overtime":"OT","comp_earned":"CTE","comp_used":"CTU","holiday":"HOL","sick":"SCK","vacation":"VAC"}'::jsonb,
 '{}'::jsonb,
 'Generic catch-all CSV with all common fields. Edit the column map to match your destination system.')
;

-- Server-side budget check function
CREATE OR REPLACE FUNCTION public.check_position_budget(_department text, _additional_fte numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _fy int := EXTRACT(YEAR FROM CURRENT_DATE)::int + CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 10 THEN 1 ELSE 0 END;
  _budget numeric;
  _used numeric;
BEGIN
  SELECT budgeted_fte INTO _budget FROM public.position_budgets
   WHERE department = _department AND fiscal_year = _fy;
  IF _budget IS NULL THEN
    RETURN jsonb_build_object('has_budget', false, 'fiscal_year', _fy, 'department', _department);
  END IF;
  SELECT COALESCE(SUM(budgeted_fte),0) INTO _used FROM public.positions
   WHERE department = _department AND status IN ('open','filled');
  RETURN jsonb_build_object(
    'has_budget', true,
    'fiscal_year', _fy,
    'department', _department,
    'budgeted_fte', _budget,
    'used_fte', _used,
    'requested_fte', COALESCE(_additional_fte,0),
    'remaining_fte', _budget - _used,
    'would_exceed', (_used + COALESCE(_additional_fte,0)) > _budget
  );
END $$;
