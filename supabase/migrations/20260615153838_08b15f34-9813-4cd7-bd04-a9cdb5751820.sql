
CREATE TABLE public.hire_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  proposed_first_name text NOT NULL,
  proposed_last_name text NOT NULL,
  proposed_email text,
  proposed_job_title text,
  proposed_department text,
  worker_type_id uuid REFERENCES public.worker_types(id) ON DELETE SET NULL,
  proposed_start_date date,
  reason text,
  notes text,
  status text NOT NULL DEFAULT 'submitted',
  hr_notes text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.hire_requests TO authenticated;
GRANT ALL ON public.hire_requests TO service_role;

ALTER TABLE public.hire_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_req insert by supervisor or hr"
  ON public.hire_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      private.has_role(auth.uid(), 'supervisor'::app_role)
      OR private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    )
  );

CREATE POLICY "hr_req read own or hr"
  ON public.hire_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "hr_req hr updates"
  ON public.hire_requests FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER trg_hire_requests_updated
  BEFORE UPDATE ON public.hire_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Atomic submission: insert request + draft employee + optional onboarding instance + tasks.
CREATE OR REPLACE FUNCTION public.create_hire_request(
  _first_name text,
  _last_name text,
  _email text,
  _job_title text,
  _department text,
  _worker_type_id uuid,
  _start_date date,
  _reason text,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req_id uuid;
  _emp_id uuid;
  _tpl_id uuid;
  _inst_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (
    private.has_role(_uid, 'supervisor'::app_role)
    OR private.has_role(_uid, 'hr_admin'::app_role)
    OR private.has_role(_uid, 'hiring_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to submit hire requests';
  END IF;

  INSERT INTO public.employees (
    first_name, last_name, personal_email, job_title, department,
    worker_type_id, start_date, status, created_by, manager_id
  ) VALUES (
    _first_name, _last_name, NULLIF(_email, ''), NULLIF(_job_title, ''), NULLIF(_department, ''),
    _worker_type_id, _start_date, 'candidate'::employee_status, _uid,
    CASE WHEN private.has_role(_uid, 'supervisor'::app_role) OR private.has_role(_uid, 'hiring_manager'::app_role) THEN _uid ELSE NULL END
  ) RETURNING id INTO _emp_id;

  INSERT INTO public.hire_requests (
    requested_by, employee_id, proposed_first_name, proposed_last_name, proposed_email,
    proposed_job_title, proposed_department, worker_type_id, proposed_start_date,
    reason, notes, status
  ) VALUES (
    _uid, _emp_id, _first_name, _last_name, NULLIF(_email, ''),
    NULLIF(_job_title, ''), NULLIF(_department, ''), _worker_type_id, _start_date,
    NULLIF(_reason, ''), NULLIF(_notes, ''), 'drafted'
  ) RETURNING id INTO _req_id;

  -- If the worker type has a default active onboarding template, seed an instance + tasks.
  IF _worker_type_id IS NOT NULL THEN
    SELECT id INTO _tpl_id
      FROM public.onboarding_templates
      WHERE worker_type_id = _worker_type_id AND is_active AND is_default
      ORDER BY created_at DESC LIMIT 1;

    IF _tpl_id IS NOT NULL THEN
      INSERT INTO public.onboarding_instances (employee_id, template_id)
      VALUES (_emp_id, _tpl_id)
      RETURNING id INTO _inst_id;

      INSERT INTO public.task_instances (
        onboarding_instance_id, template_task_id, title, description,
        category, assignee, is_required, sort_order
      )
      SELECT _inst_id, t.id, t.title, t.description, t.category, t.assignee, t.is_required, t.sort_order
        FROM public.template_tasks t
        WHERE t.template_id = _tpl_id
        ORDER BY t.sort_order;
    END IF;
  END IF;

  -- Notify HR admins
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT ur.user_id, 'hire_request', 'New hire request',
         _first_name || ' ' || _last_name || ' submitted for review',
         '/hire-requests'
    FROM public.user_roles ur WHERE ur.role = 'hr_admin'::app_role;

  RETURN _req_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_hire_request(text,text,text,text,text,uuid,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_hire_request(text,text,text,text,text,uuid,date,text,text) TO authenticated;

-- HR decision: activate (preboarding) or reject (deletes draft employee).
CREATE OR REPLACE FUNCTION public.decide_hire_request(
  _request_id uuid,
  _action text,
  _hr_notes text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req public.hire_requests%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT private.has_role(_uid, 'hr_admin'::app_role) THEN
    RAISE EXCEPTION 'Only HR admins can decide hire requests';
  END IF;

  SELECT * INTO _req FROM public.hire_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hire request not found'; END IF;

  IF _action = 'activate' THEN
    IF _req.employee_id IS NOT NULL THEN
      UPDATE public.employees SET status = 'preboarding'::employee_status WHERE id = _req.employee_id;
    END IF;
    UPDATE public.hire_requests
      SET status = 'active', hr_notes = COALESCE(_hr_notes, hr_notes),
          decided_by = _uid, decided_at = now()
      WHERE id = _request_id;

    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_req.requested_by, 'hire_request', 'Hire request approved',
            _req.proposed_first_name || ' ' || _req.proposed_last_name || ' onboarding started',
            '/hire-requests');

  ELSIF _action = 'reject' THEN
    IF _req.employee_id IS NOT NULL THEN
      DELETE FROM public.employees WHERE id = _req.employee_id;
    END IF;
    UPDATE public.hire_requests
      SET status = 'rejected', hr_notes = COALESCE(_hr_notes, hr_notes),
          decided_by = _uid, decided_at = now(), employee_id = NULL
      WHERE id = _request_id;

    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_req.requested_by, 'hire_request', 'Hire request rejected',
            COALESCE(_hr_notes, 'See HR for details'),
            '/hire-requests');
  ELSE
    RAISE EXCEPTION 'Invalid action: %', _action;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_hire_request(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_hire_request(uuid,text,text) TO authenticated;
