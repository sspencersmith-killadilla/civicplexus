
-- 1. Course content & policy fields
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS materials_url text,
  ADD COLUMN IF NOT EXISTS content_md text,
  ADD COLUMN IF NOT EXISTS passing_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS recurrence_months integer,
  ADD COLUMN IF NOT EXISTS issues_certification_id uuid REFERENCES public.certifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_assign_on_hire boolean NOT NULL DEFAULT false;

-- 2. Training assignment metadata
ALTER TABLE public.employee_training
  ADD COLUMN IF NOT EXISTS evidence_path text,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.employee_training(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- Make 'cancelled' a recognised status by convention (text column, no enum needed).

-- 3. Auto-assign required courses to new / re-typed employees
CREATE OR REPLACE FUNCTION public.tg_employees_autoassign_training()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wt_name text;
  _due date;
BEGIN
  IF NEW.worker_type_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.worker_type_id = OLD.worker_type_id THEN RETURN NEW; END IF;

  SELECT name INTO _wt_name FROM public.worker_types WHERE id = NEW.worker_type_id;
  _due := COALESCE(NEW.start_date, CURRENT_DATE) + INTERVAL '30 days';

  INSERT INTO public.employee_training (employee_id, course_id, due_date, status, assigned_by)
  SELECT NEW.id, c.id, _due, 'assigned', NULL
    FROM public.courses c
   WHERE c.active = true
     AND (c.auto_assign_on_hire = true OR (_wt_name IS NOT NULL AND _wt_name = ANY(c.required_for_worker_types)))
     AND NOT EXISTS (
       SELECT 1 FROM public.employee_training et
        WHERE et.employee_id = NEW.id AND et.course_id = c.id AND et.status <> 'cancelled'
     );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_employees_autoassign_training ON public.employees;
CREATE TRIGGER trg_employees_autoassign_training
AFTER INSERT OR UPDATE OF worker_type_id, start_date ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.tg_employees_autoassign_training();

-- 4. On completion: issue cert + queue next recurrence
CREATE OR REPLACE FUNCTION public.tg_training_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _course public.courses%ROWTYPE;
  _validity integer;
  _next_due date;
BEGIN
  IF NEW.status <> 'complete' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'complete' THEN RETURN NEW; END IF;

  SELECT * INTO _course FROM public.courses WHERE id = NEW.course_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Issue / refresh certification when course is linked to one
  IF _course.issues_certification_id IS NOT NULL THEN
    SELECT validity_months INTO _validity FROM public.certifications WHERE id = _course.issues_certification_id;
    INSERT INTO public.employee_certifications (employee_id, certification_id, issued_at, expires_at)
    VALUES (
      NEW.employee_id,
      _course.issues_certification_id,
      COALESCE(NEW.completed_at::date, CURRENT_DATE),
      CASE WHEN _validity IS NOT NULL THEN COALESCE(NEW.completed_at::date, CURRENT_DATE) + (_validity || ' months')::interval ELSE NULL END
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Queue next recurrence
  IF _course.recurrence_months IS NOT NULL AND _course.recurrence_months > 0 THEN
    _next_due := COALESCE(NEW.completed_at::date, CURRENT_DATE) + (_course.recurrence_months || ' months')::interval;
    IF NOT EXISTS (
      SELECT 1 FROM public.employee_training
       WHERE employee_id = NEW.employee_id AND course_id = NEW.course_id
         AND status <> 'complete' AND status <> 'cancelled'
    ) THEN
      INSERT INTO public.employee_training (employee_id, course_id, due_date, status, parent_id)
      VALUES (NEW.employee_id, NEW.course_id, _next_due, 'assigned', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_training_complete ON public.employee_training;
CREATE TRIGGER trg_training_complete
AFTER INSERT OR UPDATE OF status ON public.employee_training
FOR EACH ROW EXECUTE FUNCTION public.tg_training_complete();
