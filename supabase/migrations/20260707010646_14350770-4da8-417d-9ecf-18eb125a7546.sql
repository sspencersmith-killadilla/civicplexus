-- 1) Restrict employee self-updates to a small allowlist of contact fields.
CREATE OR REPLACE FUNCTION public.tg_restrict_employee_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;
  -- HR / IT admins bypass column restrictions.
  IF private.has_role(_uid, 'hr_admin'::app_role)
     OR private.has_role(_uid, 'it_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Only act on self-updates. Non-self updates are governed by other policies/roles.
  IF OLD.user_id IS DISTINCT FROM _uid THEN
    RETURN NEW;
  END IF;

  -- Enforce: only personal_email, phone, photo_path may change on self-update.
  IF NEW.user_id            IS DISTINCT FROM OLD.user_id            THEN RAISE EXCEPTION 'user_id cannot be changed'; END IF;
  IF NEW.worker_type_id     IS DISTINCT FROM OLD.worker_type_id     THEN RAISE EXCEPTION 'worker_type_id cannot be self-edited'; END IF;
  IF NEW.first_name         IS DISTINCT FROM OLD.first_name         THEN RAISE EXCEPTION 'first_name cannot be self-edited'; END IF;
  IF NEW.last_name          IS DISTINCT FROM OLD.last_name          THEN RAISE EXCEPTION 'last_name cannot be self-edited'; END IF;
  IF NEW.work_email         IS DISTINCT FROM OLD.work_email         THEN RAISE EXCEPTION 'work_email cannot be self-edited'; END IF;
  IF NEW.department         IS DISTINCT FROM OLD.department         THEN RAISE EXCEPTION 'department cannot be self-edited'; END IF;
  IF NEW.job_title          IS DISTINCT FROM OLD.job_title          THEN RAISE EXCEPTION 'job_title cannot be self-edited'; END IF;
  IF NEW.manager_id         IS DISTINCT FROM OLD.manager_id         THEN RAISE EXCEPTION 'manager_id cannot be self-edited'; END IF;
  IF NEW.start_date         IS DISTINCT FROM OLD.start_date         THEN RAISE EXCEPTION 'start_date cannot be self-edited'; END IF;
  IF NEW.end_date           IS DISTINCT FROM OLD.end_date           THEN RAISE EXCEPTION 'end_date cannot be self-edited'; END IF;
  IF NEW.status             IS DISTINCT FROM OLD.status             THEN RAISE EXCEPTION 'status cannot be self-edited'; END IF;
  IF NEW.created_by         IS DISTINCT FROM OLD.created_by         THEN RAISE EXCEPTION 'created_by cannot be self-edited'; END IF;
  IF NEW.rehire_eligible    IS DISTINCT FROM OLD.rehire_eligible    THEN RAISE EXCEPTION 'rehire_eligible cannot be self-edited'; END IF;
  IF NEW.separation_date    IS DISTINCT FROM OLD.separation_date    THEN RAISE EXCEPTION 'separation_date cannot be self-edited'; END IF;
  IF NEW.separation_reason  IS DISTINCT FROM OLD.separation_reason  THEN RAISE EXCEPTION 'separation_reason cannot be self-edited'; END IF;
  IF NEW.position_id        IS DISTINCT FROM OLD.position_id        THEN RAISE EXCEPTION 'position_id cannot be self-edited'; END IF;
  IF NEW.external_id        IS DISTINCT FROM OLD.external_id        THEN RAISE EXCEPTION 'external_id cannot be self-edited'; END IF;
  IF NEW.date_of_birth      IS DISTINCT FROM OLD.date_of_birth      THEN RAISE EXCEPTION 'date_of_birth cannot be self-edited'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_restrict_employee_self_update ON public.employees;
CREATE TRIGGER trg_restrict_employee_self_update
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_restrict_employee_self_update();

-- 2) Block employees from marking their own training complete or altering evidence/score/status/completed_at.
CREATE OR REPLACE FUNCTION public.tg_block_employee_self_training_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _target_user uuid;
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;
  IF private.has_role(_uid, 'hr_admin'::app_role)
     OR private.has_role(_uid, 'hiring_manager'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Supervisor of this employee may complete on their behalf.
  IF public.is_in_report_chain(_uid, NEW.employee_id) THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO _target_user FROM public.employees WHERE id = NEW.employee_id;
  IF _target_user IS DISTINCT FROM _uid THEN
    -- Not the employee themselves; other policies will govern permission.
    RETURN NEW;
  END IF;

  -- Employee is editing their own training row: block sensitive fields.
  IF NEW.status        IS DISTINCT FROM OLD.status        THEN RAISE EXCEPTION 'Employees cannot change training status'; END IF;
  IF NEW.completed_at  IS DISTINCT FROM OLD.completed_at  THEN RAISE EXCEPTION 'Employees cannot set training completion date'; END IF;
  IF NEW.score         IS DISTINCT FROM OLD.score         THEN RAISE EXCEPTION 'Employees cannot set training score'; END IF;
  IF NEW.evidence_path IS DISTINCT FROM OLD.evidence_path THEN RAISE EXCEPTION 'Employees cannot attach training evidence directly'; END IF;
  IF NEW.assigned_by   IS DISTINCT FROM OLD.assigned_by   THEN RAISE EXCEPTION 'assigned_by cannot be self-edited'; END IF;
  IF NEW.due_date      IS DISTINCT FROM OLD.due_date      THEN RAISE EXCEPTION 'due_date cannot be self-edited'; END IF;
  IF NEW.cancelled_at  IS DISTINCT FROM OLD.cancelled_at  THEN RAISE EXCEPTION 'cancelled_at cannot be self-edited'; END IF;
  IF NEW.cancelled_by  IS DISTINCT FROM OLD.cancelled_by  THEN RAISE EXCEPTION 'cancelled_by cannot be self-edited'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_employee_self_training_complete ON public.employee_training;
CREATE TRIGGER trg_block_employee_self_training_complete
  BEFORE UPDATE ON public.employee_training
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_employee_self_training_complete();

-- 3) Restrict ID badge template reads to HR / IT admins (they contain layout and org branding config).
DROP POLICY IF EXISTS "auth read badge templates" ON public.id_badge_templates;
CREATE POLICY "hr/it read badge templates"
  ON public.id_badge_templates FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR private.has_role(auth.uid(), 'it_admin'::app_role)
  );
