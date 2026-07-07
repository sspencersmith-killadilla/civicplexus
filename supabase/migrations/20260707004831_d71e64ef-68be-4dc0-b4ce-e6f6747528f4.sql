
ALTER TABLE public.leave_plans
  ADD COLUMN IF NOT EXISTS default_opening_balance_hours numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_enroll boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.tg_seed_default_leave_enrollments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan record;
  _from date;
BEGIN
  _from := COALESCE(NEW.start_date, CURRENT_DATE);
  FOR _plan IN
    SELECT id, default_opening_balance_hours
      FROM public.leave_plans
     WHERE is_active AND auto_enroll
       AND (worker_type_id IS NULL OR worker_type_id = NEW.worker_type_id)
  LOOP
    INSERT INTO public.employee_leave_enrollments
      (employee_id, plan_id, effective_from, opening_balance_hours)
    VALUES
      (NEW.id, _plan.id, _from, COALESCE(_plan.default_opening_balance_hours, 0))
    ON CONFLICT (employee_id, plan_id, effective_from) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_default_leave_enrollments ON public.employees;
CREATE TRIGGER trg_seed_default_leave_enrollments
AFTER INSERT ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.tg_seed_default_leave_enrollments();
