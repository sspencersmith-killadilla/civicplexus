
-- 1) Grievances: require submitted_by = auth.uid() on INSERT (drop NULL bypass).
DROP POLICY IF EXISTS "Anyone signed-in can file grievance" ON public.grievances;
CREATE POLICY "Anyone signed-in can file grievance"
  ON public.grievances FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

-- 2) Performance reviews: enforce real supervisor relationship on INSERT and
-- force manager_user_id to the caller (unless HR).
CREATE OR REPLACE FUNCTION public.tg_perf_review_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_hr boolean;
  _is_mgr boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _is_hr := private.has_role(_uid, 'hr_admin'::app_role);
  IF _is_hr THEN
    RETURN NEW;
  END IF;

  -- Must be a real manager in the target employee's reporting chain.
  SELECT public.is_in_report_chain(_uid, NEW.employee_id) INTO _is_mgr;
  IF NOT _is_mgr THEN
    RAISE EXCEPTION 'Not authorized to create a performance review for this employee';
  END IF;

  -- Force manager_user_id to the caller so it cannot be fabricated as another user.
  NEW.manager_user_id := _uid;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_perf_review_insert_guard ON public.performance_reviews;
CREATE TRIGGER trg_perf_review_insert_guard
  BEFORE INSERT ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_perf_review_insert_guard();

-- Also prevent non-HR managers from reassigning a review to a different employee on UPDATE.
CREATE OR REPLACE FUNCTION public.tg_perf_review_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;
  IF private.has_role(_uid, 'hr_admin'::app_role) THEN RETURN NEW; END IF;

  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'Only HR may reassign a performance review to a different employee';
  END IF;
  IF NEW.manager_user_id IS DISTINCT FROM OLD.manager_user_id
     AND NEW.manager_user_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'manager_user_id may only be set to the current supervisor';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_perf_review_update_guard ON public.performance_reviews;
CREATE TRIGGER trg_perf_review_update_guard
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_perf_review_update_guard();

-- 3) record_audit_event: tighten policy_acknowledge to require an existing ack row for this user.
CREATE OR REPLACE FUNCTION public.record_audit_event(
  _action text, _entity text, _entity_id uuid, _diff jsonb DEFAULT NULL::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _id uuid;
  _uid uuid := auth.uid();
  _exists boolean := false;
  _ok boolean := false;
  _is_hr boolean;
  _allowed_actions text[] := ARRAY[
    'review_finalized','review_signed','review_reopened','review_rating_changed',
    'grievance_acknowledge','grievance_assign','grievance_resolve',
    'job_requisition_status','job_application_status','offer_status',
    'applicant_ai_screen','applicant_ai_decision','applicant_ai_parse',
    'coaching_ai_summary','coaching_ai_followups','coaching_ai_calibration',
    'policy_acknowledge','training_assigned'
  ];
  _allowed_entities text[] := ARRAY[
    'performance_review','grievance','job_requisition','job_application','offer',
    'one_on_one','policy','employee_training','employee'
  ];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (_action = ANY(_allowed_actions)) THEN
    RAISE EXCEPTION 'Audit action % is not permitted from this endpoint', _action;
  END IF;
  IF NOT (_entity = ANY(_allowed_entities)) THEN
    RAISE EXCEPTION 'Audit entity % is not permitted from this endpoint', _entity;
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', _entity)
    INTO _exists USING _entity_id;
  IF NOT _exists THEN
    RAISE EXCEPTION 'Referenced % % does not exist', _entity, _entity_id;
  END IF;

  _is_hr := private.has_role(_uid, 'hr_admin'::app_role);

  IF _is_hr THEN
    _ok := true;
  ELSIF _entity = 'performance_review' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.performance_reviews pr
      LEFT JOIN public.employees emp ON emp.id = pr.employee_id
      LEFT JOIN public.employees mgr ON mgr.id = emp.manager_id
      WHERE pr.id = _entity_id
        AND (emp.user_id = _uid OR mgr.user_id = _uid)
    ) INTO _ok;
  ELSIF _entity = 'employee_training' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.employee_training et
      LEFT JOIN public.employees emp ON emp.id = et.employee_id
      LEFT JOIN public.employees mgr ON mgr.id = emp.manager_id
      WHERE et.id = _entity_id AND (emp.user_id = _uid OR mgr.user_id = _uid)
    ) INTO _ok;
  ELSIF _entity = 'employee' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.employees e
      LEFT JOIN public.employees mgr ON mgr.id = e.manager_id
      WHERE e.id = _entity_id AND (e.user_id = _uid OR mgr.user_id = _uid)
    ) INTO _ok;
  ELSIF _entity = 'grievance' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.grievances g
      WHERE g.id = _entity_id
        AND (g.submitted_by = _uid OR g.assigned_hr_id = _uid)
    ) INTO _ok;
  ELSIF _entity IN ('job_requisition','job_application','offer') THEN
    _ok := private.has_role(_uid, 'hiring_manager'::app_role)
        OR private.has_role(_uid, 'hr_admin'::app_role);
  ELSIF _entity = 'one_on_one' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.one_on_ones o
      LEFT JOIN public.employees emp ON emp.id = o.employee_id
      LEFT JOIN public.employees mgr ON mgr.id = emp.manager_id
      WHERE o.id = _entity_id AND (emp.user_id = _uid OR mgr.user_id = _uid)
    ) INTO _ok;
  ELSIF _entity = 'policy' THEN
    -- Require a real acknowledgment row for this user + policy.
    IF _action = 'policy_acknowledge' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.policy_acknowledgments pa
        WHERE pa.policy_id = _entity_id AND pa.user_id = _uid
      ) INTO _ok;
    END IF;
  END IF;

  IF NOT _ok THEN
    RAISE EXCEPTION 'Not authorized to record audit for % %', _entity, _entity_id;
  END IF;

  INSERT INTO public.audit_events(actor_id, action, entity, entity_id, diff)
  VALUES (_uid, _action, _entity, _entity_id, _diff)
  RETURNING id INTO _id;
  RETURN _id;
END $$;
