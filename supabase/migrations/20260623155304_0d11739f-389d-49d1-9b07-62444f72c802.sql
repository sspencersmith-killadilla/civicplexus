
-- ============== COMPLIANCE & REPORTING ==============

-- flsa_reviews: per-position FLSA classification reviews
CREATE TABLE public.flsa_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  exempt_basis text,
  duties_test_notes text,
  decision text NOT NULL CHECK (decision IN ('exempt','non_exempt','needs_review')),
  next_review_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_flsa_reviews_position ON public.flsa_reviews(position_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flsa_reviews TO authenticated;
GRANT ALL ON public.flsa_reviews TO service_role;
ALTER TABLE public.flsa_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manages flsa reviews" ON public.flsa_reviews FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER trg_flsa_reviews_updated BEFORE UPDATE ON public.flsa_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- policy_campaigns: named acknowledgment drives for a policy
CREATE TABLE public.policy_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  name text NOT NULL,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','closed','cancelled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.policy_campaigns TO authenticated;
GRANT ALL ON public.policy_campaigns TO service_role;
ALTER TABLE public.policy_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manages policy campaigns" ON public.policy_campaigns FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "all auth read active campaigns" ON public.policy_campaigns FOR SELECT TO authenticated
  USING (status = 'active');
CREATE TRIGGER trg_policy_campaigns_updated BEFORE UPDATE ON public.policy_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- policy_campaign_assignments
CREATE TABLE public.policy_campaign_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.policy_campaigns(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  acknowledgment_id uuid REFERENCES public.policy_acknowledgments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete','waived')),
  last_nudged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, employee_id)
);
CREATE INDEX idx_pca_employee ON public.policy_campaign_assignments(employee_id);
CREATE INDEX idx_pca_status ON public.policy_campaign_assignments(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.policy_campaign_assignments TO authenticated;
GRANT ALL ON public.policy_campaign_assignments TO service_role;
ALTER TABLE public.policy_campaign_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manages pca" ON public.policy_campaign_assignments FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "employee reads own pca" ON public.policy_campaign_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE TRIGGER trg_pca_updated BEFORE UPDATE ON public.policy_campaign_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Trigger: when policy_acknowledgments row is added, complete any matching open campaign assignment
CREATE OR REPLACE FUNCTION public.tg_policy_ack_completes_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.policy_campaign_assignments pca
     SET status = 'complete',
         acknowledgment_id = NEW.id,
         completed_at = now()
   WHERE pca.employee_id = NEW.employee_id
     AND pca.status = 'pending'
     AND EXISTS (
       SELECT 1 FROM public.policy_campaigns pc
        WHERE pc.id = pca.campaign_id
          AND pc.policy_id = NEW.policy_id
          AND pc.status = 'active'
     );
  INSERT INTO public.audit_events (actor_id, action, entity, entity_id, diff)
  VALUES (NEW.user_id, 'acknowledge', 'policy', NEW.policy_id, jsonb_build_object('employee_id', NEW.employee_id, 'version', NEW.version));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_policy_ack_completes ON public.policy_acknowledgments;
CREATE TRIGGER trg_policy_ack_completes AFTER INSERT ON public.policy_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.tg_policy_ack_completes_assignment();

-- ============== COMPENSATION & PAY BANDS ==============

CREATE TABLE public.pay_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  min_annual numeric(12,2) NOT NULL,
  mid_annual numeric(12,2) NOT NULL,
  max_annual numeric(12,2) NOT NULL,
  flsa_default text CHECK (flsa_default IN ('exempt','non_exempt')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pay_grades TO authenticated;
GRANT ALL ON public.pay_grades TO service_role;
ALTER TABLE public.pay_grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all auth read pay grades" ON public.pay_grades FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr manages pay grades" ON public.pay_grades FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER trg_pay_grades_updated BEFORE UPDATE ON public.pay_grades
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Position link to pay grade
ALTER TABLE public.positions ADD COLUMN pay_grade_id uuid REFERENCES public.pay_grades(id) ON DELETE SET NULL;
CREATE INDEX idx_positions_pay_grade ON public.positions(pay_grade_id);

CREATE TABLE public.comp_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  effective_date date NOT NULL,
  budget_pct numeric(5,2) NOT NULL DEFAULT 3.0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','review','approved','finalized','cancelled')),
  eligibility_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comp_cycles TO authenticated;
GRANT ALL ON public.comp_cycles TO service_role;
ALTER TABLE public.comp_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manages comp cycles" ON public.comp_cycles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "manager reads relevant cycles" ON public.comp_cycles FOR SELECT TO authenticated
  USING (status IN ('open','review','approved','finalized'));
CREATE TRIGGER trg_comp_cycles_updated BEFORE UPDATE ON public.comp_cycles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.employee_comp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  base_annual numeric(12,2),
  hourly_rate numeric(8,2),
  target_bonus_pct numeric(5,2),
  target_equity numeric(12,2),
  currency text NOT NULL DEFAULT 'USD',
  pay_grade_id uuid REFERENCES public.pay_grades(id) ON DELETE SET NULL,
  change_reason text,
  source text NOT NULL DEFAULT 'adjustment' CHECK (source IN ('hire','merit','promotion','adjustment','cycle','market')),
  cycle_id uuid REFERENCES public.comp_cycles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_emp_comp_employee ON public.employee_comp(employee_id, effective_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_comp TO authenticated;
GRANT ALL ON public.employee_comp TO service_role;
ALTER TABLE public.employee_comp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manages employee comp" ON public.employee_comp FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "employee reads own comp" ON public.employee_comp FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY "manager reads team comp" ON public.employee_comp FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees emp
     JOIN public.employees mgr ON mgr.id = emp.manager_id
    WHERE emp.id = employee_id AND mgr.user_id = auth.uid()
  ));
CREATE TRIGGER trg_employee_comp_updated BEFORE UPDATE ON public.employee_comp
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Audit trigger on every insert
CREATE OR REPLACE FUNCTION public.tg_employee_comp_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, entity, entity_id, diff)
  VALUES (NEW.created_by, 'comp_change', 'employee', NEW.employee_id,
    jsonb_build_object('effective_date', NEW.effective_date, 'base_annual', NEW.base_annual,
                       'source', NEW.source, 'reason', NEW.change_reason, 'cycle_id', NEW.cycle_id));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_employee_comp_audit AFTER INSERT ON public.employee_comp
  FOR EACH ROW EXECUTE FUNCTION public.tg_employee_comp_audit();

CREATE TABLE public.market_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_family text NOT NULL,
  level text NOT NULL,
  geo text NOT NULL DEFAULT 'US',
  currency text NOT NULL DEFAULT 'USD',
  p25 numeric(12,2) NOT NULL,
  p50 numeric(12,2) NOT NULL,
  p75 numeric(12,2) NOT NULL,
  source text,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_ranges_lookup ON public.market_ranges(job_family, level, geo);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_ranges TO authenticated;
GRANT ALL ON public.market_ranges TO service_role;
ALTER TABLE public.market_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth reads market ranges" ON public.market_ranges FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr manages market ranges" ON public.market_ranges FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER trg_market_ranges_updated BEFORE UPDATE ON public.market_ranges
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.comp_review_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.comp_cycles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  current_comp_id uuid REFERENCES public.employee_comp(id) ON DELETE SET NULL,
  latest_review_id uuid REFERENCES public.performance_reviews(id) ON DELETE SET NULL,
  latest_rating text,
  recommended_merit_pct numeric(5,2),
  proposed_merit_pct numeric(5,2),
  proposed_promotion_grade_id uuid REFERENCES public.pay_grades(id) ON DELETE SET NULL,
  proposed_bonus_amount numeric(12,2),
  manager_notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','approved','rejected','applied')),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);
CREATE INDEX idx_crp_manager ON public.comp_review_participants(manager_id);
CREATE INDEX idx_crp_cycle ON public.comp_review_participants(cycle_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comp_review_participants TO authenticated;
GRANT ALL ON public.comp_review_participants TO service_role;
ALTER TABLE public.comp_review_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manages crp" ON public.comp_review_participants FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE POLICY "manager reads own team crp" ON public.comp_review_participants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees m WHERE m.id = manager_id AND m.user_id = auth.uid()));
CREATE POLICY "manager updates own team crp" ON public.comp_review_participants FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees m WHERE m.id = manager_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.employees m WHERE m.id = manager_id AND m.user_id = auth.uid()));
CREATE TRIGGER trg_crp_updated BEFORE UPDATE ON public.comp_review_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed participants when cycle opens
CREATE OR REPLACE FUNCTION public.tg_seed_comp_cycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _emp record;
  _filter jsonb := COALESCE(NEW.eligibility_filter, '{}'::jsonb);
  _depts text[];
  _current_comp_id uuid;
  _latest_review_id uuid;
  _latest_rating text;
BEGIN
  IF NOT (NEW.status = 'open' AND (OLD.status IS DISTINCT FROM 'open')) THEN RETURN NEW; END IF;

  IF _filter ? 'departments' THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(_filter->'departments')) INTO _depts;
  END IF;

  FOR _emp IN
    SELECT e.* FROM public.employees e
     WHERE e.status = 'active'::employee_status
       AND (_depts IS NULL OR e.department = ANY(_depts))
  LOOP
    SELECT id INTO _current_comp_id FROM public.employee_comp
     WHERE employee_id = _emp.id ORDER BY effective_date DESC LIMIT 1;
    SELECT id, overall_rating INTO _latest_review_id, _latest_rating FROM public.performance_reviews
     WHERE employee_id = _emp.id AND status = 'finalized'
     ORDER BY review_period_end DESC NULLS LAST LIMIT 1;

    INSERT INTO public.comp_review_participants (cycle_id, employee_id, manager_id, current_comp_id, latest_review_id, latest_rating, recommended_merit_pct)
    VALUES (NEW.id, _emp.id, _emp.manager_id, _current_comp_id, _latest_review_id, _latest_rating,
            CASE _latest_rating
              WHEN 'exceeds' THEN NEW.budget_pct + 1.5
              WHEN 'exceptional' THEN NEW.budget_pct + 2.5
              WHEN 'meets' THEN NEW.budget_pct
              WHEN 'below' THEN GREATEST(NEW.budget_pct - 1.5, 0)
              ELSE NEW.budget_pct
            END)
    ON CONFLICT (cycle_id, employee_id) DO NOTHING;

    IF _emp.manager_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      SELECT m.user_id, 'comp_cycle', 'Comp review open',
             'Enter recommendation for ' || _emp.first_name || ' ' || _emp.last_name,
             '/comp/cycles/' || NEW.id::text
        FROM public.employees m WHERE m.id = _emp.manager_id AND m.user_id IS NOT NULL;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_seed_comp_cycle AFTER UPDATE ON public.comp_cycles
  FOR EACH ROW EXECUTE FUNCTION public.tg_seed_comp_cycle();
