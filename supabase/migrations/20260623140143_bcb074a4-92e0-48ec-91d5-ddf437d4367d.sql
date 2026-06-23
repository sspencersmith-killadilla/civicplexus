
-- =========================================
-- LEAVE PLANS
-- =========================================
CREATE TABLE public.leave_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  paid BOOLEAN NOT NULL DEFAULT TRUE,
  requires_balance BOOLEAN NOT NULL DEFAULT TRUE,
  accrual_rate_hours NUMERIC(8,4) NOT NULL DEFAULT 0,
  accrual_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (accrual_frequency IN ('per_pay_period','monthly','annually','none')),
  max_balance_hours NUMERIC(10,2),
  max_carryover_hours NUMERIC(10,2),
  is_fmla BOOLEAN NOT NULL DEFAULT FALSE,
  is_comp_time BOOLEAN NOT NULL DEFAULT FALSE,
  worker_type_id UUID REFERENCES public.worker_types(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.leave_plans TO authenticated;
GRANT ALL ON public.leave_plans TO service_role;

ALTER TABLE public.leave_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in reads leave plans"
  ON public.leave_plans FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "HR manages leave plans"
  ON public.leave_plans FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER trg_leave_plans_updated_at BEFORE UPDATE ON public.leave_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================
-- EMPLOYEE LEAVE ENROLLMENTS
-- =========================================
CREATE TABLE public.employee_leave_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.leave_plans(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  opening_balance_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, plan_id, effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_leave_enrollments TO authenticated;
GRANT ALL ON public.employee_leave_enrollments TO service_role;

ALTER TABLE public.employee_leave_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees read own enrollments"
  ON public.employee_leave_enrollments FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR employee_id IN (SELECT id FROM public.employees WHERE manager_id = auth.uid())
  );

CREATE POLICY "HR manages enrollments"
  ON public.employee_leave_enrollments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER trg_leave_enrollments_updated_at BEFORE UPDATE ON public.employee_leave_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================
-- LEAVE BALANCES (current snapshot)
-- =========================================
CREATE TABLE public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.leave_plans(id) ON DELETE CASCADE,
  accrued_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  used_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  pending_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance_hours NUMERIC(10,2) GENERATED ALWAYS AS (accrued_hours - used_hours) STORED,
  last_accrual_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, plan_id)
);

GRANT SELECT, INSERT, UPDATE ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees read own balances"
  ON public.leave_balances FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR employee_id IN (SELECT id FROM public.employees WHERE manager_id = auth.uid())
  );

CREATE POLICY "HR manages balances"
  ON public.leave_balances FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER trg_leave_balances_updated_at BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================
-- LEAVE REQUESTS
-- =========================================
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.leave_plans(id) ON DELETE RESTRICT,
  fmla_case_id UUID,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_hours NUMERIC(10,2) NOT NULL,
  is_intermittent BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','approved','denied','cancelled')),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  submitted_by UUID REFERENCES auth.users(id),
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leave_requests_emp ON public.leave_requests(employee_id, start_date DESC);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);

GRANT SELECT, INSERT, UPDATE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or reports leave requests"
  ON public.leave_requests FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR employee_id IN (SELECT id FROM public.employees WHERE manager_id = auth.uid())
  );

CREATE POLICY "Employees create own leave requests"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

CREATE POLICY "Supervisors/HR update leave requests"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR employee_id IN (SELECT id FROM public.employees WHERE manager_id = auth.uid())
    OR (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()) AND status IN ('draft','submitted'))
  );

CREATE TRIGGER trg_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================
-- FMLA CASES
-- =========================================
CREATE TABLE public.fmla_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT UNIQUE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  is_intermittent BOOLEAN NOT NULL DEFAULT FALSE,
  eligibility_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  eligibility_notes TEXT,
  certification_received_at DATE,
  certification_expires_at DATE,
  case_start_date DATE NOT NULL,
  case_end_date DATE,
  rolling_period_start DATE NOT NULL,
  hours_entitled NUMERIC(10,2) NOT NULL DEFAULT 480,
  hours_used NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','denied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.fmla_cases TO authenticated;
GRANT ALL ON public.fmla_cases TO service_role;

ALTER TABLE public.fmla_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or reports FMLA"
  ON public.fmla_cases FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR employee_id IN (SELECT id FROM public.employees WHERE manager_id = auth.uid())
  );

CREATE POLICY "HR manages FMLA"
  ON public.fmla_cases FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER trg_fmla_cases_updated_at BEFORE UPDATE ON public.fmla_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_fmla_case_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.case_number IS NULL THEN
    NEW.case_number := 'FMLA-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random()*900000)+100000)::int::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_fmla_case_num BEFORE INSERT ON public.fmla_cases
  FOR EACH ROW EXECUTE FUNCTION public.tg_fmla_case_number();

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_fmla_fk FOREIGN KEY (fmla_case_id) REFERENCES public.fmla_cases(id) ON DELETE SET NULL;

-- =========================================
-- PERSONNEL ACTIONS (PAFs)
-- =========================================
CREATE TABLE public.personnel_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paf_number TEXT UNIQUE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'hire','rehire','transfer','promotion','demotion','reclassification',
    'pay_change','status_change','leave_start','leave_return','separation','position_change','other'
  )),
  effective_date DATE NOT NULL,
  reason TEXT,
  narrative TEXT,
  before_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','denied','applied','cancelled')),
  initiated_by UUID NOT NULL REFERENCES auth.users(id),
  approval_chain_id UUID REFERENCES public.approval_chains(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_paf_emp ON public.personnel_actions(employee_id, effective_date DESC);
CREATE INDEX idx_paf_status ON public.personnel_actions(status);

GRANT SELECT, INSERT, UPDATE ON public.personnel_actions TO authenticated;
GRANT ALL ON public.personnel_actions TO service_role;

ALTER TABLE public.personnel_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read PAFs for self, reports, or HR"
  ON public.personnel_actions FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR initiated_by = auth.uid()
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR employee_id IN (SELECT id FROM public.employees WHERE manager_id = auth.uid())
  );

CREATE POLICY "Supervisors/HR create PAFs"
  ON public.personnel_actions FOR INSERT TO authenticated
  WITH CHECK (
    initiated_by = auth.uid()
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'supervisor'::app_role)
      OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    )
  );

CREATE POLICY "Update PAFs by initiator or HR"
  ON public.personnel_actions FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR (initiated_by = auth.uid() AND status IN ('draft','pending_approval'))
  );

CREATE TRIGGER trg_paf_updated_at BEFORE UPDATE ON public.personnel_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_paf_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.paf_number IS NULL THEN
    NEW.paf_number := 'PAF-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random()*900000)+100000)::int::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_paf_num BEFORE INSERT ON public.personnel_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_paf_number();

-- =========================================
-- PAF AUDIT TRAIL
-- =========================================
CREATE TABLE public.paf_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paf_id UUID NOT NULL REFERENCES public.personnel_actions(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  notes TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_paf_audit_paf ON public.paf_audit(paf_id, created_at);

GRANT SELECT, INSERT ON public.paf_audit TO authenticated;
GRANT ALL ON public.paf_audit TO service_role;

ALTER TABLE public.paf_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read paf audit if can read PAF"
  ON public.paf_audit FOR SELECT TO authenticated
  USING (
    paf_id IN (
      SELECT id FROM public.personnel_actions
      WHERE private.has_role(auth.uid(), 'hr_admin'::app_role)
        OR initiated_by = auth.uid()
        OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
        OR employee_id IN (SELECT id FROM public.employees WHERE manager_id = auth.uid())
    )
  );

CREATE POLICY "Insert paf audit via app"
  ON public.paf_audit FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_paf_log_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.paf_audit (paf_id, actor_id, event_type, to_status, payload)
    VALUES (NEW.id, NEW.initiated_by, 'created', NEW.status, jsonb_build_object('paf_number', NEW.paf_number, 'action_type', NEW.action_type));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.paf_audit (paf_id, actor_id, event_type, from_status, to_status)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.tg_paf_log_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_paf_audit AFTER INSERT OR UPDATE ON public.personnel_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_paf_log_changes();

-- =========================================
-- Seed default leave plans
-- =========================================
INSERT INTO public.leave_plans (code, name, description, paid, accrual_rate_hours, accrual_frequency, max_carryover_hours, sort_order) VALUES
  ('VAC', 'Vacation', 'Annual paid vacation leave', TRUE, 6.67, 'monthly', 240, 1),
  ('SICK', 'Sick Leave', 'Paid sick leave', TRUE, 8.00, 'monthly', NULL, 2),
  ('PERSONAL', 'Personal Day', 'Personal leave', TRUE, 0, 'annually', 0, 3),
  ('BEREAVE', 'Bereavement', 'Bereavement leave', TRUE, 0, 'none', 0, 4),
  ('JURY', 'Jury Duty', 'Jury duty / civic leave', TRUE, 0, 'none', 0, 5),
  ('MIL', 'Military Leave', 'USERRA military leave', TRUE, 0, 'none', 0, 6),
  ('FMLA', 'FMLA', 'Family & Medical Leave Act', FALSE, 0, 'none', 0, 7),
  ('COMP', 'Comp Time', 'FLSA compensatory time off (1.5x OT)', TRUE, 0, 'none', 240, 8),
  ('UNPAID', 'Unpaid Leave', 'Approved unpaid leave', FALSE, 0, 'none', 0, 9)
ON CONFLICT (code) DO NOTHING;

UPDATE public.leave_plans SET is_fmla = TRUE WHERE code = 'FMLA';
UPDATE public.leave_plans SET is_comp_time = TRUE, requires_balance = TRUE WHERE code = 'COMP';
UPDATE public.leave_plans SET requires_balance = FALSE WHERE code IN ('BEREAVE','JURY','MIL','UNPAID');

-- =========================================
-- Helper: decide a PAF approval step (mirrors hiring approval flow)
-- =========================================
CREATE OR REPLACE FUNCTION public.decide_paf_step(_step_id uuid, _decision text, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _uid uuid := auth.uid();
  _step public.approval_steps%ROWTYPE;
  _chain public.approval_chains%ROWTYPE;
  _paf public.personnel_actions%ROWTYPE;
  _next public.approval_steps%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _step FROM public.approval_steps WHERE id = _step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Step not found'; END IF;
  IF _step.status <> 'pending' THEN RAISE EXCEPTION 'Step already decided'; END IF;

  -- Authorize: either named approver, has the required role, or HR admin
  IF NOT (
    _step.approver_id = _uid
    OR (_step.required_role IS NOT NULL AND private.has_role(_uid, _step.required_role::app_role))
    OR private.has_role(_uid, 'hr_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to decide this step';
  END IF;

  UPDATE public.approval_steps
     SET status = _decision, decided_by = _uid, decided_at = now(), notes = COALESCE(_notes, notes)
   WHERE id = _step_id;

  SELECT * INTO _chain FROM public.approval_chains WHERE id = _step.chain_id;
  SELECT * INTO _paf FROM public.personnel_actions WHERE approval_chain_id = _chain.id LIMIT 1;

  IF _decision = 'denied' THEN
    UPDATE public.personnel_actions SET status = 'denied' WHERE id = _paf.id;
    RETURN;
  END IF;

  -- Find next pending step
  SELECT * INTO _next FROM public.approval_steps
    WHERE chain_id = _chain.id AND status = 'pending'
    ORDER BY stage ASC LIMIT 1;

  IF NOT FOUND THEN
    -- All approved → mark PAF approved
    UPDATE public.personnel_actions SET status = 'approved' WHERE id = _paf.id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_paf_step(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_paf_step(uuid, text, text) TO authenticated;
