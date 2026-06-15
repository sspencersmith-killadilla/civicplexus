-- 1) Re-scope employee self-read policies from personal_email match to user_id match
DROP POLICY IF EXISTS "employee read own benefits" ON public.benefits_handoffs;
CREATE POLICY "employee read own benefits" ON public.benefits_handoffs
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee read own dependents" ON public.dependents;
CREATE POLICY "employee read own dependents" ON public.dependents
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee read own certifications" ON public.employee_certifications;
CREATE POLICY "employee read own certifications" ON public.employee_certifications
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee read own training" ON public.employee_training;
CREATE POLICY "employee read own training" ON public.employee_training
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee read own equipment" ON public.equipment_issuance;
CREATE POLICY "employee read own equipment" ON public.equipment_issuance
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee read own ppe" ON public.ppe_sizing;
CREATE POLICY "employee read own ppe" ON public.ppe_sizing
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "employee read own screenings" ON public.screenings;
CREATE POLICY "employee read own screenings" ON public.screenings
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

-- 2) form_submissions: remove blanket hiring_manager read; keep employee self + HR admin
DROP POLICY IF EXISTS "submissions_owner_rw" ON public.form_submissions;
CREATE POLICY "submissions_owner_rw" ON public.form_submissions
  FOR ALL TO authenticated
  USING (
    (EXISTS (SELECT 1 FROM public.employees e
              WHERE e.id = form_submissions.employee_id AND e.user_id = auth.uid()))
    OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  )
  WITH CHECK (
    (EXISTS (SELECT 1 FROM public.employees e
              WHERE e.id = form_submissions.employee_id AND e.user_id = auth.uid()))
    OR private.has_role(auth.uid(), 'hr_admin'::app_role)
  );

-- 3) Add missing UPDATE policy on the onboarding-documents storage bucket
DROP POLICY IF EXISTS "onboarding_docs_update" ON storage.objects;
CREATE POLICY "onboarding_docs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'onboarding-documents'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid()
          AND (storage.foldername(objects.name))[1] = e.id::text
      )
    )
  )
  WITH CHECK (
    bucket_id = 'onboarding-documents'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid()
          AND (storage.foldername(objects.name))[1] = e.id::text
      )
    )
  );