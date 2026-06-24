
-- 1) Restrict employee self-update on performance_reviews to ONLY the self-assessment column
DROP POLICY IF EXISTS "Employee update own self-assessment" ON public.performance_reviews;

CREATE OR REPLACE FUNCTION public.tg_review_employee_self_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  -- HR admins and the assigned manager bypass this guard (their own policies allow full updates)
  IF private.has_role(auth.uid(), 'hr_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF OLD.manager_user_id IS NOT NULL AND OLD.manager_user_id = auth.uid() THEN
    RETURN NEW;
  END IF;
  -- For the employee themselves, only employee_self_assessment may change
  IF NEW.manager_narrative IS DISTINCT FROM OLD.manager_narrative
     OR NEW.overall_rating IS DISTINCT FROM OLD.overall_rating
     OR NEW.ratings IS DISTINCT FROM OLD.ratings
     OR NEW.ai_draft IS DISTINCT FROM OLD.ai_draft
     OR NEW.ai_generated_at IS DISTINCT FROM OLD.ai_generated_at
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
     OR NEW.review_period_start IS DISTINCT FROM OLD.review_period_start
     OR NEW.review_period_end IS DISTINCT FROM OLD.review_period_end
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.manager_user_id IS DISTINCT FROM OLD.manager_user_id
  THEN
    RAISE EXCEPTION 'Employees may only update their self-assessment on their own review';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_perf_review_employee_self_cols ON public.performance_reviews;
CREATE TRIGGER tg_perf_review_employee_self_cols
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_review_employee_self_update_columns();

CREATE POLICY "Employee update own self-assessment"
ON public.performance_reviews
FOR UPDATE
TO authenticated
USING (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
)
WITH CHECK (
  employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
);

-- 2) Tighten anon job_applications insert policy: resume_url must be NULL when inserted via RLS
--    (the trusted server route uses service-role and bypasses RLS, so legitimate uploads still work)
DROP POLICY IF EXISTS "Anon applies to public postings" ON public.job_applications;
CREATE POLICY "Anon applies to public postings"
ON public.job_applications
FOR INSERT
TO anon
WITH CHECK (
  is_internal = false
  AND resume_url IS NULL
  AND requisition_id IN (
    SELECT id FROM public.job_requisitions
    WHERE status = 'posted' AND internal_only = false
  )
);
