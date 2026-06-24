
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS fallback_admin_user_id uuid;
ALTER TABLE public.onboarding_templates ALTER COLUMN worker_type_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='employee_status' AND e.enumlabel='on_leave') THEN
    ALTER TYPE public.employee_status ADD VALUE 'on_leave';
  END IF;
END $$;

INSERT INTO public.onboarding_templates (id, name, description, is_default, is_active, template_type, worker_type_id)
SELECT gen_random_uuid(), 'Standard Offboarding', 'Default separation checklist', true, true, 'offboarding', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_templates WHERE template_type='offboarding');

WITH tpl AS (SELECT id FROM public.onboarding_templates WHERE template_type='offboarding' LIMIT 1)
INSERT INTO public.template_tasks (template_id, title, description, category, assignee, is_required, days_offset, sort_order)
SELECT tpl.id, t.title, t.description, t.category::public.task_category, t.assignee::public.task_assignee, t.is_required, t.days_offset, t.sort_order
FROM tpl, (VALUES
  ('Schedule exit interview', 'HR conducts exit interview with departing employee', 'other', 'hr', true, -7, 10),
  ('Submit final timesheet', 'Employee submits final hours worked', 'other', 'employee', true, 0, 20),
  ('Return equipment', 'Laptop, badge, keys, uniforms, PPE', 'equipment', 'employee', true, 0, 30),
  ('Revoke building/library access', 'Disable badge and physical access', 'provisioning', 'facilities', true, 0, 40),
  ('Disable IT accounts', 'Email, SSO, app access, MFA tokens', 'provisioning', 'it', true, 0, 50),
  ('Send COBRA / benefits packet', 'Mail continuation-of-coverage materials', 'compliance', 'hr', true, 3, 60),
  ('Calculate final pay', 'Include PTO payout per policy', 'compliance', 'payroll', true, 1, 70),
  ('Report TMRS separation', 'Submit separation report to TMRS', 'compliance', 'hr', true, 7, 80),
  ('Knowledge transfer documented', 'Manager confirms handoff complete', 'other', 'manager', true, -3, 90),
  ('Manager attestation', 'Manager signs off on completed checklist', 'other', 'manager', true, 0, 100)
) AS t(title, description, category, assignee, is_required, days_offset, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.template_tasks tt WHERE tt.template_id=tpl.id);

CREATE OR REPLACE FUNCTION public.resolve_approver(_role text, _manager_user_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _u uuid; _fb uuid;
BEGIN
  SELECT fallback_admin_user_id INTO _fb FROM public.org_settings LIMIT 1;
  IF _role = 'supervisor' AND _manager_user_id IS NOT NULL THEN
    RETURN _manager_user_id;
  END IF;
  SELECT user_id INTO _u FROM public.user_roles WHERE role::text = _role ORDER BY user_id LIMIT 1;
  RETURN COALESCE(_u, _fb);
END $$;
GRANT EXECUTE ON FUNCTION public.resolve_approver(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_set_employee_status(_employee_id uuid, _new_status public.employee_status, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, private AS $$
DECLARE _uid uuid := auth.uid(); _old text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT private.has_role(_uid,'hr_admin'::app_role) THEN RAISE EXCEPTION 'HR admin only'; END IF;
  SELECT status::text INTO _old FROM public.employees WHERE id=_employee_id;
  UPDATE public.employees SET status=_new_status WHERE id=_employee_id;
  INSERT INTO public.audit_events(actor_id, action, entity, entity_id, diff)
  VALUES (_uid, 'status_change', 'employee', _employee_id, jsonb_build_object('from',_old,'to',_new_status::text,'note',_note));
END $$;
GRANT EXECUTE ON FUNCTION public.hr_set_employee_status(uuid, public.employee_status, text) TO authenticated;
