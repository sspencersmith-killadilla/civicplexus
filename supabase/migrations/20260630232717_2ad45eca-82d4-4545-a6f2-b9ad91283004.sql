
-- 1. Remove the open directory read policy on employees.
-- The /directory and /org-chart pages already use server functions (supabaseAdmin)
-- that return a bounded, safe column projection. Direct table reads now require
-- HR, the employee's manager, or the employee themselves.
DROP POLICY IF EXISTS "Employees: directory read for authenticated" ON public.employees;

-- 2. Strengthen the perf review manager policy: remove the self-claimed
-- manager_user_id check and rely solely on a genuine manager-employee relationship.
DROP POLICY IF EXISTS "Manager manage own reviews" ON public.performance_reviews;
CREATE POLICY "Manager manage own reviews" ON public.performance_reviews
  FOR ALL TO authenticated
  USING (
    employee_id IN (
      SELECT e.id FROM public.employees e
      WHERE e.manager_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    employee_id IN (
      SELECT e.id FROM public.employees e
      WHERE e.manager_id IN (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
      )
    )
  );

-- 3. Harden record_audit_event with per-entity authorization checks so an
-- arbitrary authenticated user cannot fabricate audit trail entries.
CREATE OR REPLACE FUNCTION public.record_audit_event(
  _action text, _entity text, _entity_id uuid, _diff jsonb DEFAULT NULL::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private'
AS $function$
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

  -- Per-entity authorization: caller must have a real relationship to the entity.
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
    -- Policy acknowledgements: any authenticated employee may log their own ack.
    _ok := (_action = 'policy_acknowledge');
  END IF;

  IF NOT _ok THEN
    RAISE EXCEPTION 'Not authorized to record audit for % %', _entity, _entity_id;
  END IF;

  INSERT INTO public.audit_events(actor_id, action, entity, entity_id, diff)
  VALUES (_uid, _action, _entity, _entity_id, _diff)
  RETURNING id INTO _id;
  RETURN _id;
END
$function$;
