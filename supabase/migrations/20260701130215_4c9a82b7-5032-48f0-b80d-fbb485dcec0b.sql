
-- Harden anon insert policy on job_applications to constrain ALL internal-only fields
DROP POLICY IF EXISTS "Anon applies to public postings" ON public.job_applications;
CREATE POLICY "Anon applies to public postings"
  ON public.job_applications
  FOR INSERT
  TO anon
  WITH CHECK (
    is_internal = false
    AND resume_url IS NULL
    AND COALESCE(notify_current_manager, false) = false
    AND internal_employee_id IS NULL
    AND source IS NULL
    AND status = 'new'
    AND rating IS NULL
    AND notes IS NULL
    AND rejection_reason IS NULL
    AND COALESCE(answers, '{}'::jsonb) = '{}'::jsonb
    AND requisition_id IN (
      SELECT id FROM public.job_requisitions
       WHERE status = 'posted' AND internal_only = false
    )
  );
