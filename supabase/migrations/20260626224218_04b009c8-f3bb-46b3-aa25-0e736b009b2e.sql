
CREATE OR REPLACE FUNCTION public.compute_timesheet(_employee_id uuid, _week_start date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  _pol public.time_policies%ROWTYPE;
  _wt_class text;
  _sched public.employee_schedules%ROWTYPE;
  _wp public.employee_work_periods%ROWTYPE;
  _week_end date := _week_start + 6;
  _ts_id uuid;
  _reg numeric := 0; _ot numeric := 0; _comp numeric := 0; _leave_h numeric := 0;
  _expected numeric := 40;
  _weekly_threshold numeric;
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

  -- Look up an active 207(k) work period (overrides the standard weekly OT threshold)
  SELECT * INTO _wp FROM public.employee_work_periods
    WHERE employee_id = _employee_id AND effective_from <= _week_end
      AND (effective_to IS NULL OR effective_to >= _week_start)
    ORDER BY effective_from DESC LIMIT 1;
  _weekly_threshold := _pol.weekly_ot_threshold;
  IF _wp.id IS NOT NULL AND _wp.period_days > 0 THEN
    -- Pro-rate the period threshold down to a weekly equivalent
    _weekly_threshold := _wp.ot_threshold_hours * (7.0 / _wp.period_days);
  END IF;

  SELECT COALESCE(SUM(lr.total_hours),0) INTO _leave_h FROM public.leave_requests lr
    WHERE lr.employee_id = _employee_id AND lr.status = 'approved'
      AND lr.start_date <= _week_end AND lr.end_date >= _week_start;

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

    IF _pol.rounding_minutes > 0 THEN
      _day_minutes := round(_day_minutes / _pol.rounding_minutes) * _pol.rounding_minutes;
    END IF;

    -- Daily OT only applies when no 207(k) override is set (207(k) is period-based)
    IF _wt_class = 'non_exempt' AND _wp.id IS NULL
       AND _day_minutes/60.0 > _pol.daily_ot_threshold THEN
      _ot := _ot + (_day_minutes/60.0 - _pol.daily_ot_threshold);
      _reg := _reg + _pol.daily_ot_threshold;
    ELSE
      _reg := _reg + _day_minutes/60.0;
    END IF;
  END LOOP;

  IF _wt_class = 'non_exempt' THEN
    IF (_reg + _ot) > _weekly_threshold THEN
      _ot := _ot + (_reg - _weekly_threshold);
      _reg := _weekly_threshold;
    END IF;
    IF _pol.allow_comp_in_lieu THEN
      _comp := _ot * _pol.comp_time_multiplier;
      _ot := 0;
    END IF;
  ELSE
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
END $function$;
