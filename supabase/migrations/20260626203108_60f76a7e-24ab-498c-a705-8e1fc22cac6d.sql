
-- 1) Classify worker types
ALTER TABLE public.worker_types
  ADD COLUMN IF NOT EXISTS flsa_class text NOT NULL DEFAULT 'non_exempt'
    CHECK (flsa_class IN ('exempt','non_exempt'));

-- Seed sensible defaults based on existing names
UPDATE public.worker_types
   SET flsa_class = 'exempt'
 WHERE flsa_class = 'non_exempt'
   AND (lower(name) ~ '(director|manager|chief|exempt|salaried|executive|administrator)');

-- 2) Org-wide time policy (singleton-ish)
CREATE TABLE IF NOT EXISTS public.time_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Default',
  workweek_start smallint NOT NULL DEFAULT 1 CHECK (workweek_start BETWEEN 0 AND 6), -- 0=Sun
  daily_ot_threshold numeric(5,2) NOT NULL DEFAULT 8,
  weekly_ot_threshold numeric(5,2) NOT NULL DEFAULT 40,
  ot_multiplier numeric(4,2) NOT NULL DEFAULT 1.5,
  comp_time_multiplier numeric(4,2) NOT NULL DEFAULT 1.5,
  exempt_comp_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
  max_comp_bank_hours numeric(8,2),
  rounding_minutes smallint NOT NULL DEFAULT 0 CHECK (rounding_minutes IN (0,5,6,15)),
  allow_comp_in_lieu boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.time_policies TO authenticated;
GRANT ALL ON public.time_policies TO service_role;
ALTER TABLE public.time_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_policies read auth" ON public.time_policies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_policies HR manages" ON public.time_policies
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER trg_time_policies_uat BEFORE UPDATE ON public.time_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.time_policies (name) SELECT 'Default'
  WHERE NOT EXISTS (SELECT 1 FROM public.time_policies);

-- 3) Per-employee weekly schedule
CREATE TABLE IF NOT EXISTS public.employee_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  expected_weekly_hours numeric(5,2) NOT NULL DEFAULT 40,
  -- HH:MM stored as text for simplicity; null = day off
  mon_start text, mon_end text,
  tue_start text, tue_end text,
  wed_start text, wed_end text,
  thu_start text, thu_end text,
  fri_start text, fri_end text,
  sat_start text, sat_end text,
  sun_start text, sun_end text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emp_sched_emp ON public.employee_schedules(employee_id, effective_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_schedules TO authenticated;
GRANT ALL ON public.employee_schedules TO service_role;
ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sched self read" ON public.employee_schedules
  FOR SELECT TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR private.has_role(auth.uid(),'hr_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.id = employee_schedules.employee_id
                 AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  );
CREATE POLICY "sched HR manages" ON public.employee_schedules
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
CREATE TRIGGER trg_emp_sched_uat BEFORE UPDATE ON public.employee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Time entries (clock in/out)
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','kiosk','manual','import')),
  notes text,
  edited_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  pay_period_id uuid REFERENCES public.pay_periods(id) ON DELETE SET NULL,
  timesheet_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (clock_out IS NULL OR clock_out > clock_in)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_entries_open
  ON public.time_entries(employee_id) WHERE clock_out IS NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_emp_day
  ON public.time_entries(employee_id, clock_in DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time self read" ON public.time_entries
  FOR SELECT TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR private.has_role(auth.uid(),'hr_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.id = time_entries.employee_id
                 AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  );
CREATE POLICY "time self insert" ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR private.has_role(auth.uid(),'hr_admin'::app_role)
  );
CREATE POLICY "time self update" ON public.time_entries
  FOR UPDATE TO authenticated USING (
    (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()) AND approved_at IS NULL)
    OR private.has_role(auth.uid(),'hr_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.id = time_entries.employee_id
                 AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  );
CREATE TRIGGER trg_time_entries_uat BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Breaks (optional unpaid)
CREATE TABLE IF NOT EXISTS public.time_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  break_start timestamptz NOT NULL DEFAULT now(),
  break_end timestamptz,
  paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (break_end IS NULL OR break_end > break_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_breaks_open
  ON public.time_breaks(time_entry_id) WHERE break_end IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_breaks TO authenticated;
GRANT ALL ON public.time_breaks TO service_role;
ALTER TABLE public.time_breaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "breaks via entry" ON public.time_breaks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.time_entries te WHERE te.id = time_breaks.time_entry_id
                 AND (te.employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
                      OR private.has_role(auth.uid(),'hr_admin'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.time_entries te WHERE te.id = time_breaks.time_entry_id
                 AND (te.employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
                      OR private.has_role(auth.uid(),'hr_admin'::app_role))));

-- 6) Timesheets (weekly rollup)
CREATE TABLE IF NOT EXISTS public.timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  regular_hours numeric(8,2) NOT NULL DEFAULT 0,
  overtime_hours numeric(8,2) NOT NULL DEFAULT 0,
  comp_time_earned numeric(8,2) NOT NULL DEFAULT 0,
  holiday_hours numeric(8,2) NOT NULL DEFAULT 0,
  leave_hours numeric(8,2) NOT NULL DEFAULT 0,
  expected_hours numeric(8,2) NOT NULL DEFAULT 40,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','approved','denied','locked')),
  submitted_at timestamptz,
  submitted_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, week_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheets TO authenticated;
GRANT ALL ON public.timesheets TO service_role;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ts self read" ON public.timesheets
  FOR SELECT TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR private.has_role(auth.uid(),'hr_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.id = timesheets.employee_id
                 AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  );
CREATE POLICY "ts HR/supv manage" ON public.timesheets
  FOR UPDATE TO authenticated USING (
    private.has_role(auth.uid(),'hr_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.id = timesheets.employee_id
                 AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );
CREATE POLICY "ts self insert" ON public.timesheets
  FOR INSERT TO authenticated WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR private.has_role(auth.uid(),'hr_admin'::app_role)
  );
CREATE TRIGGER trg_timesheets_uat BEFORE UPDATE ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Comp-time balances and ledger
CREATE TABLE IF NOT EXISTS public.comp_time_balances (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  balance_hours numeric(10,2) NOT NULL DEFAULT 0,
  pending_hours numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comp_time_balances TO authenticated;
GRANT ALL ON public.comp_time_balances TO service_role;
ALTER TABLE public.comp_time_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compbal self read" ON public.comp_time_balances
  FOR SELECT TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR private.has_role(auth.uid(),'hr_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.id = comp_time_balances.employee_id
                 AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  );

CREATE TABLE IF NOT EXISTS public.comp_time_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  delta_hours numeric(10,2) NOT NULL,
  reason text NOT NULL CHECK (reason IN ('earned','used','cashed_out','adjustment','expired')),
  source_entry_id uuid REFERENCES public.time_entries(id) ON DELETE SET NULL,
  source_timesheet_id uuid REFERENCES public.timesheets(id) ON DELETE SET NULL,
  source_leave_request_id uuid REFERENCES public.leave_requests(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_ledger_emp ON public.comp_time_ledger(employee_id, created_at DESC);
GRANT SELECT ON public.comp_time_ledger TO authenticated;
GRANT ALL ON public.comp_time_ledger TO service_role;
ALTER TABLE public.comp_time_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compled self read" ON public.comp_time_ledger
  FOR SELECT TO authenticated USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR private.has_role(auth.uid(),'hr_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e
               WHERE e.id = comp_time_ledger.employee_id
                 AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()))
  );

-- Ledger trigger keeps balance in sync
CREATE OR REPLACE FUNCTION public.tg_comp_ledger_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.comp_time_balances (employee_id, balance_hours)
  VALUES (NEW.employee_id, NEW.delta_hours)
  ON CONFLICT (employee_id)
    DO UPDATE SET balance_hours = public.comp_time_balances.balance_hours + NEW.delta_hours,
                  updated_at = now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_comp_ledger_apply ON public.comp_time_ledger;
CREATE TRIGGER trg_comp_ledger_apply AFTER INSERT ON public.comp_time_ledger
  FOR EACH ROW EXECUTE FUNCTION public.tg_comp_ledger_apply();

-- 8) Hook leave_requests approval to debit comp-time when plan.is_comp_time
CREATE OR REPLACE FUNCTION public.tg_leave_comp_time_debit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _is_comp boolean;
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT is_comp_time INTO _is_comp FROM public.leave_plans WHERE id = NEW.plan_id;
    IF _is_comp THEN
      INSERT INTO public.comp_time_ledger (employee_id, delta_hours, reason, source_leave_request_id, created_by, notes)
      VALUES (NEW.employee_id, -1 * NEW.total_hours, 'used', NEW.id, NEW.decided_by,
              'Leave request ' || NEW.id::text);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_leave_comp_time_debit ON public.leave_requests;
CREATE TRIGGER trg_leave_comp_time_debit AFTER INSERT OR UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_leave_comp_time_debit();

-- 9) Helper: compute and store timesheet totals for a week
CREATE OR REPLACE FUNCTION public.compute_timesheet(_employee_id uuid, _week_start date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _pol public.time_policies%ROWTYPE;
  _wt_class text;
  _sched public.employee_schedules%ROWTYPE;
  _week_end date := _week_start + 6;
  _ts_id uuid;
  _reg numeric := 0; _ot numeric := 0; _comp numeric := 0; _leave_h numeric := 0;
  _expected numeric := 40;
  _day date; _day_minutes numeric;
BEGIN
  SELECT * INTO _pol FROM public.time_policies WHERE is_active LIMIT 1;
  SELECT wt.flsa_class INTO _wt_class FROM public.employees e
    LEFT JOIN public.worker_types wt ON wt.id = e.worker_type_id
    WHERE e.id = _employee_id;
  SELECT * INTO _sched FROM public.employee_schedules
    WHERE employee_id = _employee_id AND effective_from <= _week_end
      AND (effective_to IS NULL OR effective_to >= _week_start)
    ORDER BY effective_from DESC LIMIT 1;
  IF _sched.id IS NOT NULL THEN _expected := _sched.expected_weekly_hours; END IF;

  -- Sum approved leave hours overlapping this week
  SELECT COALESCE(SUM(lr.total_hours),0) INTO _leave_h FROM public.leave_requests lr
    WHERE lr.employee_id = _employee_id AND lr.status = 'approved'
      AND lr.start_date <= _week_end AND lr.end_date >= _week_start;

  -- Daily aggregation of closed time entries
  FOR _day IN SELECT generate_series(_week_start, _week_end, '1 day'::interval)::date LOOP
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (te.clock_out - te.clock_in))/60.0),0)
           - COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (b.break_end - b.break_start))/60.0)
                         FROM public.time_breaks b JOIN public.time_entries t2 ON t2.id=b.time_entry_id
                        WHERE t2.employee_id = _employee_id
                          AND b.break_end IS NOT NULL AND b.paid = false
                          AND (b.break_start AT TIME ZONE 'UTC')::date = _day),0)
      INTO _day_minutes
      FROM public.time_entries te
      WHERE te.employee_id = _employee_id AND te.clock_out IS NOT NULL
        AND (te.clock_in AT TIME ZONE 'UTC')::date = _day;
    IF _day_minutes IS NULL THEN _day_minutes := 0; END IF;

    -- Rounding
    IF _pol.rounding_minutes > 0 THEN
      _day_minutes := round(_day_minutes / _pol.rounding_minutes) * _pol.rounding_minutes;
    END IF;

    -- Daily OT (non-exempt only)
    IF _wt_class = 'non_exempt' AND _day_minutes/60.0 > _pol.daily_ot_threshold THEN
      _ot := _ot + (_day_minutes/60.0 - _pol.daily_ot_threshold);
      _reg := _reg + _pol.daily_ot_threshold;
    ELSE
      _reg := _reg + _day_minutes/60.0;
    END IF;
  END LOOP;

  -- Weekly OT or exempt comp time
  IF _wt_class = 'non_exempt' THEN
    IF (_reg + _ot) > _pol.weekly_ot_threshold THEN
      _ot := _ot + ((_reg) - _pol.weekly_ot_threshold);
      _reg := _pol.weekly_ot_threshold;
    END IF;
    IF _pol.allow_comp_in_lieu THEN
      _comp := _ot * _pol.comp_time_multiplier;
      _ot := 0;
    END IF;
  ELSE
    -- Exempt: extra over expected banks straight comp time
    IF _reg > _expected THEN
      _comp := (_reg - _expected) * _pol.exempt_comp_multiplier;
      _reg := _expected;
    END IF;
  END IF;

  INSERT INTO public.timesheets (employee_id, week_start, week_end, regular_hours, overtime_hours,
                                 comp_time_earned, leave_hours, expected_hours)
  VALUES (_employee_id, _week_start, _week_end, round(_reg::numeric,2), round(_ot::numeric,2),
          round(_comp::numeric,2), round(_leave_h::numeric,2), _expected)
  ON CONFLICT (employee_id, week_start) DO UPDATE
    SET regular_hours = EXCLUDED.regular_hours,
        overtime_hours = EXCLUDED.overtime_hours,
        comp_time_earned = EXCLUDED.comp_time_earned,
        leave_hours = EXCLUDED.leave_hours,
        expected_hours = EXCLUDED.expected_hours,
        updated_at = now()
    WHERE public.timesheets.status IN ('open','denied')
  RETURNING id INTO _ts_id;
  IF _ts_id IS NULL THEN
    SELECT id INTO _ts_id FROM public.timesheets WHERE employee_id=_employee_id AND week_start=_week_start;
  END IF;
  RETURN _ts_id;
END $$;

-- 10) Approve timesheet -> post comp time earned
CREATE OR REPLACE FUNCTION public.approve_timesheet(_ts_id uuid, _decision text, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE _uid uuid := auth.uid(); _ts public.timesheets%ROWTYPE; _allowed boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _ts FROM public.timesheets WHERE id = _ts_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timesheet not found'; END IF;
  SELECT (
    private.has_role(_uid,'hr_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = _ts.employee_id
               AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = _uid))
  ) INTO _allowed;
  IF NOT _allowed THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF _decision = 'approved' THEN
    UPDATE public.timesheets
      SET status='approved', approved_by=_uid, approved_at=now(), notes=COALESCE(_notes, notes)
      WHERE id = _ts_id;
    IF _ts.comp_time_earned > 0 AND _ts.status <> 'approved' THEN
      INSERT INTO public.comp_time_ledger (employee_id, delta_hours, reason, source_timesheet_id, created_by, notes)
      VALUES (_ts.employee_id, _ts.comp_time_earned, 'earned', _ts_id, _uid,
              'Timesheet week of ' || _ts.week_start::text);
    END IF;
  ELSIF _decision = 'denied' THEN
    UPDATE public.timesheets SET status='denied', approved_by=_uid, approved_at=now(),
           notes=COALESCE(_notes, notes) WHERE id=_ts_id;
  ELSE
    RAISE EXCEPTION 'Invalid decision';
  END IF;
END $$;

-- 11) Clock in/out helpers
CREATE OR REPLACE FUNCTION public.clock_in(_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _emp uuid; _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO _emp FROM public.employees WHERE user_id=_uid AND status='active'::employee_status LIMIT 1;
  IF _emp IS NULL THEN RAISE EXCEPTION 'No active employee record'; END IF;
  IF EXISTS (SELECT 1 FROM public.time_entries WHERE employee_id=_emp AND clock_out IS NULL) THEN
    RAISE EXCEPTION 'Already clocked in';
  END IF;
  INSERT INTO public.time_entries (employee_id, clock_in, source, notes)
  VALUES (_emp, now(), 'web', _note) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.clock_out(_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _emp uuid; _id uuid; _ws date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO _emp FROM public.employees WHERE user_id=_uid LIMIT 1;
  IF _emp IS NULL THEN RAISE EXCEPTION 'No employee record'; END IF;
  UPDATE public.time_entries SET clock_out = now(),
         notes = COALESCE(_note, notes)
    WHERE employee_id=_emp AND clock_out IS NULL
    RETURNING id, ((clock_in AT TIME ZONE 'UTC')::date - EXTRACT(DOW FROM clock_in)::int) INTO _id, _ws;
  IF _id IS NULL THEN RAISE EXCEPTION 'No open entry'; END IF;
  -- Refresh the week's timesheet
  PERFORM public.compute_timesheet(_emp, _ws);
  RETURN _id;
END $$;
