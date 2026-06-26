
-- Tighten the anonymous job application insert: forbid notify_current_manager = true
DROP POLICY IF EXISTS "Anon applies to public postings" ON public.job_applications;
CREATE POLICY "Anon applies to public postings" ON public.job_applications
FOR INSERT TO anon
WITH CHECK (
  is_internal = false
  AND resume_url IS NULL
  AND COALESCE(notify_current_manager, false) = false
  AND internal_employee_id IS NULL
  AND requisition_id IN (
    SELECT job_requisitions.id FROM public.job_requisitions
    WHERE job_requisitions.status = 'posted'
      AND job_requisitions.internal_only = false
  )
);

-- Allow anonymous external applicants to insert their self-ID record
-- only when the parent application belongs to a publicly posted job
-- and is itself an external (non-internal) application.
DROP POLICY IF EXISTS "Anon self-id insert for public applications" ON public.application_self_id;
CREATE POLICY "Anon self-id insert for public applications" ON public.application_self_id
FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.job_applications a
    JOIN public.job_requisitions r ON r.id = a.requisition_id
    WHERE a.id = application_self_id.application_id
      AND a.is_internal = false
      AND a.internal_employee_id IS NULL
      AND r.status = 'posted'
      AND r.internal_only = false
  )
);

GRANT INSERT ON public.application_self_id TO anon;
