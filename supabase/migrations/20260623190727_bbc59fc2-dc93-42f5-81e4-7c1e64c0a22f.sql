
-- 1) audit_events: drop open insert policy, add controlled RPC
DROP POLICY IF EXISTS "auth inserts audit" ON public.audit_events;

CREATE OR REPLACE FUNCTION public.record_audit_event(
  _action text,
  _entity text,
  _entity_id uuid,
  _diff jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.audit_events(actor_id, action, entity, entity_id, diff)
  VALUES (_uid, _action, _entity, _entity_id, _diff)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.record_audit_event(text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_audit_event(text, text, uuid, jsonb) TO authenticated;

-- 2) employees: drop broad self-update; add a contact-only RPC
DROP POLICY IF EXISTS "Employees: self update limited" ON public.employees;

CREATE OR REPLACE FUNCTION public.update_my_employee_contact(
  _personal_email text DEFAULT NULL,
  _phone text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.employees
     SET personal_email = COALESCE(_personal_email, personal_email),
         phone = COALESCE(_phone, phone)
   WHERE user_id = _uid;
END $$;

REVOKE ALL ON FUNCTION public.update_my_employee_contact(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_employee_contact(text, text) TO authenticated;

-- 3) employee_training: drop self-update; add narrow "mark started" RPC
DROP POLICY IF EXISTS "employee update own training" ON public.employee_training;

CREATE OR REPLACE FUNCTION public.mark_my_training_started(
  _training_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.employee_training et
     SET status = 'in_progress'
   WHERE et.id = _training_id
     AND et.status = 'assigned'
     AND et.employee_id IN (SELECT id FROM public.employees WHERE user_id = _uid);
END $$;

REVOKE ALL ON FUNCTION public.mark_my_training_started(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_my_training_started(uuid) TO authenticated;
