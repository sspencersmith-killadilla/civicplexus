
-- 1) audit_events: force writes through record_audit_event() only.
REVOKE INSERT, UPDATE, DELETE ON public.audit_events FROM anon, authenticated;

-- 2) Restrict employee self-updates on public.employees to safe columns only.
CREATE OR REPLACE FUNCTION public.tg_restrict_employee_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_hr boolean;
  _is_supervisor_of boolean := false;
  _is_dept_admin boolean := false;
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;

  _is_hr := private.has_role(_uid, 'hr_admin'::app_role);
  IF _is_hr THEN RETURN NEW; END IF;

  IF OLD.manager_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.employees m
       WHERE m.id = OLD.manager_id AND m.user_id = _uid
    ) INTO _is_supervisor_of;
  END IF;
  IF _is_supervisor_of THEN RETURN NEW; END IF;

  IF OLD.department IS NOT NULL THEN
    SELECT public.is_department_admin(_uid, OLD.department) INTO _is_dept_admin;
  END IF;
  IF _is_dept_admin THEN RETURN NEW; END IF;

  -- Only the employee editing their own record from here on.
  IF OLD.user_id IS DISTINCT FROM _uid THEN
    -- Not self and not privileged — block outright.
    RAISE EXCEPTION 'Not authorized to update employee record';
  END IF;

  -- Self-service: whitelist which columns may change.
  IF NEW.first_name          IS DISTINCT FROM OLD.first_name          THEN RAISE EXCEPTION 'Employees cannot change first_name'; END IF;
  IF NEW.last_name           IS DISTINCT FROM OLD.last_name           THEN RAISE EXCEPTION 'Employees cannot change last_name'; END IF;
  IF NEW.employee_number     IS DISTINCT FROM OLD.employee_number     THEN RAISE EXCEPTION 'Employees cannot change employee_number'; END IF;
  IF NEW.user_id             IS DISTINCT FROM OLD.user_id             THEN RAISE EXCEPTION 'Employees cannot change user_id'; END IF;
  IF NEW.status              IS DISTINCT FROM OLD.status              THEN RAISE EXCEPTION 'Employees cannot change status'; END IF;
  IF NEW.manager_id          IS DISTINCT FROM OLD.manager_id          THEN RAISE EXCEPTION 'Employees cannot change manager_id'; END IF;
  IF NEW.department          IS DISTINCT FROM OLD.department          THEN RAISE EXCEPTION 'Employees cannot change department'; END IF;
  IF NEW.job_title           IS DISTINCT FROM OLD.job_title           THEN RAISE EXCEPTION 'Employees cannot change job_title'; END IF;
  IF NEW.position_id         IS DISTINCT FROM OLD.position_id         THEN RAISE EXCEPTION 'Employees cannot change position_id'; END IF;
  IF NEW.worker_type_id      IS DISTINCT FROM OLD.worker_type_id      THEN RAISE EXCEPTION 'Employees cannot change worker_type_id'; END IF;
  IF NEW.start_date          IS DISTINCT FROM OLD.start_date          THEN RAISE EXCEPTION 'Employees cannot change start_date'; END IF;
  IF NEW.termination_date    IS DISTINCT FROM OLD.termination_date    THEN RAISE EXCEPTION 'Employees cannot change termination_date'; END IF;
  IF NEW.created_by          IS DISTINCT FROM OLD.created_by          THEN RAISE EXCEPTION 'Employees cannot change created_by'; END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_restrict_employee_self_update ON public.employees;
CREATE TRIGGER trg_restrict_employee_self_update
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.tg_restrict_employee_self_update();

-- 3) Restrict employee self-updates on performance_reviews to self-assessment only.
CREATE OR REPLACE FUNCTION public.tg_restrict_review_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_hr boolean;
  _is_mgr boolean := false;
  _is_self boolean := false;
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;

  _is_hr := private.has_role(_uid, 'hr_admin'::app_role);
  IF _is_hr THEN RETURN NEW; END IF;

  SELECT public.is_in_report_chain(_uid, OLD.employee_id) INTO _is_mgr;
  IF _is_mgr THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = OLD.employee_id AND e.user_id = _uid
  ) INTO _is_self;

  IF NOT _is_self THEN
    RAISE EXCEPTION 'Not authorized to update this performance review';
  END IF;

  -- Employee self-service: only the self-assessment text may change.
  IF NEW.employee_id       IS DISTINCT FROM OLD.employee_id       THEN RAISE EXCEPTION 'Employees cannot reassign a review'; END IF;
  IF NEW.manager_user_id   IS DISTINCT FROM OLD.manager_user_id   THEN RAISE EXCEPTION 'Employees cannot change manager_user_id'; END IF;
  IF NEW.status            IS DISTINCT FROM OLD.status            THEN RAISE EXCEPTION 'Employees cannot change review status'; END IF;
  IF NEW.manager_narrative IS DISTINCT FROM OLD.manager_narrative THEN RAISE EXCEPTION 'Employees cannot edit manager narrative'; END IF;
  IF NEW.overall_rating    IS DISTINCT FROM OLD.overall_rating    THEN RAISE EXCEPTION 'Employees cannot set overall rating'; END IF;
  IF NEW.ratings           IS DISTINCT FROM OLD.ratings           THEN RAISE EXCEPTION 'Employees cannot change ratings'; END IF;
  IF NEW.ai_draft          IS DISTINCT FROM OLD.ai_draft          THEN RAISE EXCEPTION 'Employees cannot change ai_draft'; END IF;
  IF NEW.ai_generated_at   IS DISTINCT FROM OLD.ai_generated_at   THEN RAISE EXCEPTION 'Employees cannot change ai_generated_at'; END IF;
  IF NEW.finalized_at      IS DISTINCT FROM OLD.finalized_at      THEN RAISE EXCEPTION 'Employees cannot change finalized_at'; END IF;
  IF NEW.review_period_start IS DISTINCT FROM OLD.review_period_start THEN RAISE EXCEPTION 'Employees cannot change review period'; END IF;
  IF NEW.review_period_end   IS DISTINCT FROM OLD.review_period_end   THEN RAISE EXCEPTION 'Employees cannot change review period'; END IF;
  IF NEW.created_by        IS DISTINCT FROM OLD.created_by        THEN RAISE EXCEPTION 'Employees cannot change created_by'; END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_restrict_review_self_update ON public.performance_reviews;
CREATE TRIGGER trg_restrict_review_self_update
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_restrict_review_self_update();
