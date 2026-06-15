ALTER TABLE public.worker_types
  ADD COLUMN IF NOT EXISTS default_provisioning jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.create_hire_request(
  _first_name text, _last_name text, _email text, _job_title text, _department text,
  _worker_type_id uuid, _start_date date, _reason text, _notes text,
  _provisioning_kinds text[] DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _req_id uuid;
  _emp_id uuid;
  _tpl_id uuid;
  _inst_id uuid;
  _kind text;
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

  IF _provisioning_kinds IS NOT NULL THEN
    FOREACH _kind IN ARRAY _provisioning_kinds LOOP
      INSERT INTO public.provisioning_requests (employee_id, kind, status)
      VALUES (_emp_id, _kind, 'pending');
    END LOOP;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT ur.user_id, 'hire_request', 'New hire request',
         _first_name || ' ' || _last_name || ' submitted for review',
         '/hire-requests'
    FROM public.user_roles ur WHERE ur.role = 'hr_admin'::app_role;

  RETURN _req_id;
END;
$function$;