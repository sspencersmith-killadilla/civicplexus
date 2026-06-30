
-- 1) Harden record_audit_event: allow-list actions + entity existence check
CREATE OR REPLACE FUNCTION public.record_audit_event(_action text, _entity text, _entity_id uuid, _diff jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  _id uuid;
  _uid uuid := auth.uid();
  _exists boolean := false;
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
  -- Validate the target row exists (defends against fabricated entity_id)
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', _entity)
    INTO _exists USING _entity_id;
  IF NOT _exists THEN
    RAISE EXCEPTION 'Referenced % % does not exist', _entity, _entity_id;
  END IF;
  INSERT INTO public.audit_events(actor_id, action, entity, entity_id, diff)
  VALUES (_uid, _action, _entity, _entity_id, _diff)
  RETURNING id INTO _id;
  RETURN _id;
END
$function$;

-- 2) Block employees from self-editing sensitive employee columns
CREATE OR REPLACE FUNCTION public.tg_block_employee_self_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;
  -- HR admin bypass
  IF private.has_role(_uid, 'hr_admin'::app_role) THEN RETURN NEW; END IF;
  -- The employee's manager (resolved via employees.id) bypass
  IF OLD.manager_id IS NOT NULL AND OLD.manager_id IN (
    SELECT id FROM public.employees WHERE user_id = _uid
  ) THEN RETURN NEW; END IF;
  -- If this is the employee editing their own row, restrict to safe contact fields
  IF OLD.user_id IS NOT NULL AND OLD.user_id = _uid THEN
    IF NEW.first_name        IS DISTINCT FROM OLD.first_name
       OR NEW.last_name      IS DISTINCT FROM OLD.last_name
       OR NEW.work_email     IS DISTINCT FROM OLD.work_email
       OR NEW.department     IS DISTINCT FROM OLD.department
       OR NEW.job_title      IS DISTINCT FROM OLD.job_title
       OR NEW.manager_id     IS DISTINCT FROM OLD.manager_id
       OR NEW.status         IS DISTINCT FROM OLD.status
       OR NEW.start_date     IS DISTINCT FROM OLD.start_date
       OR NEW.end_date       IS DISTINCT FROM OLD.end_date
       OR NEW.separation_date IS DISTINCT FROM OLD.separation_date
       OR NEW.separation_reason IS DISTINCT FROM OLD.separation_reason
       OR NEW.rehire_eligible IS DISTINCT FROM OLD.rehire_eligible
       OR NEW.worker_type_id IS DISTINCT FROM OLD.worker_type_id
       OR NEW.position_id    IS DISTINCT FROM OLD.position_id
       OR NEW.external_id    IS DISTINCT FROM OLD.external_id
       OR NEW.user_id        IS DISTINCT FROM OLD.user_id
       OR NEW.photo_path     IS DISTINCT FROM OLD.photo_path
       OR NEW.date_of_birth  IS DISTINCT FROM OLD.date_of_birth
    THEN
      RAISE EXCEPTION 'Employees may only update their own contact details (personal email, phone).';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_employee_self_sensitive_update ON public.employees;
CREATE TRIGGER trg_block_employee_self_sensitive_update
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.tg_block_employee_self_sensitive_update();

-- 3) Block employees from self-marking training complete / changing score / due date
CREATE OR REPLACE FUNCTION public.tg_block_employee_self_training_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE _uid uuid := auth.uid(); _is_self boolean;
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;
  IF private.has_role(_uid, 'hr_admin'::app_role)
     OR private.has_role(_uid, 'hiring_manager'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Allow the direct manager
  IF EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employees m ON m.id = e.manager_id
    WHERE e.id = NEW.employee_id AND m.user_id = _uid
  ) THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.employees WHERE id = NEW.employee_id AND user_id = _uid
  ) INTO _is_self;

  IF _is_self THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('in_progress') THEN
      RAISE EXCEPTION 'Employees may only start training; completion requires HR or supervisor';
    END IF;
    IF NEW.score IS DISTINCT FROM OLD.score
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.evidence_path IS DISTINCT FROM OLD.evidence_path
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.course_id IS DISTINCT FROM OLD.course_id
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
    THEN
      RAISE EXCEPTION 'Employees may not edit training score, completion, evidence, or due date';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_employee_self_training_complete ON public.employee_training;
CREATE TRIGGER trg_block_employee_self_training_complete
BEFORE UPDATE ON public.employee_training
FOR EACH ROW EXECUTE FUNCTION public.tg_block_employee_self_training_complete();
