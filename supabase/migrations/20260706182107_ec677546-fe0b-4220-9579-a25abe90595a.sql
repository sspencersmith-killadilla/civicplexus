-- 1) review_ratings: replace flawed manager check with reporting-chain function
DROP POLICY IF EXISTS "Managers & employees access own review ratings" ON public.review_ratings;

CREATE POLICY "Employees read own review ratings"
ON public.review_ratings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.performance_reviews pr
    JOIN public.employees e ON e.id = pr.employee_id
    WHERE pr.id = review_ratings.review_id
      AND e.user_id = auth.uid()
  )
);

CREATE POLICY "Managers manage report review ratings"
ON public.review_ratings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.performance_reviews pr
    WHERE pr.id = review_ratings.review_id
      AND public.is_in_report_chain(auth.uid(), pr.employee_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.performance_reviews pr
    WHERE pr.id = review_ratings.review_id
      AND public.is_in_report_chain(auth.uid(), pr.employee_id)
  )
);

-- 2) Storage: restrict logos folder to hr_admin only
DROP POLICY IF EXISTS "auth read employee photo assets" ON storage.objects;

CREATE POLICY "auth read employee photo assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR (
      (storage.foldername(name))[1] = 'photos'
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id::text = (storage.foldername(objects.name))[2]
          AND e.user_id = auth.uid()
      )
    )
  )
);

-- 3) Public supplemental questions: exclude internal_only postings
DROP POLICY IF EXISTS "Public read supplemental questions for posted jobs" ON public.job_supplemental_questions;

CREATE POLICY "Public read supplemental questions for posted jobs"
ON public.job_supplemental_questions
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.job_requisitions r
    WHERE r.id = job_supplemental_questions.requisition_id
      AND r.status = 'posted'
      AND r.internal_only = false
  )
);