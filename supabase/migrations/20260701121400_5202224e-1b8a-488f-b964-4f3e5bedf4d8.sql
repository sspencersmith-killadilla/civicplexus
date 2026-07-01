
-- 1. Scope employees manager-reads policy to authenticated role
DROP POLICY IF EXISTS "Employees: manager reads" ON public.employees;
CREATE POLICY "Employees: manager reads" ON public.employees
  FOR SELECT
  TO authenticated
  USING (
    manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );

-- 2. Scope interview_kits hiring-staff read policy to authenticated role
DROP POLICY IF EXISTS "kits_read_hiring_staff" ON public.interview_kits;
CREATE POLICY "kits_read_hiring_staff" ON public.interview_kits
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.interview_invitations inv
      WHERE inv.kit_id = interview_kits.id
        AND inv.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.interviews i
      WHERE (i.created_by = auth.uid() OR auth.uid() = ANY(i.interviewer_ids))
    )
  );

-- 3. Restrict public exposure of job_requisitions to a safe view
CREATE OR REPLACE VIEW public.job_requisitions_public AS
  SELECT
    id, slug, title, department, location, employment_type,
    summary, description, requirements, benefits,
    posting_sections, posted_at, closes_at,
    salary_min, salary_max, brochure_url
  FROM public.job_requisitions
  WHERE status = 'posted' AND internal_only = false;

-- View intentionally runs with owner privileges so that anon can read the
-- curated columns without direct SELECT on the base table.
ALTER VIEW public.job_requisitions_public SET (security_invoker = off);

GRANT SELECT ON public.job_requisitions_public TO anon, authenticated;

-- Remove the base-table anon SELECT policy and privilege so anon can no
-- longer read internal columns (hiring_manager_id, requested_by, ai_rubric,
-- hire_request_id, etc.) directly.
DROP POLICY IF EXISTS "req public read" ON public.job_requisitions;
REVOKE SELECT ON public.job_requisitions FROM anon;
