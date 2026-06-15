
-- Recreate storage policies using private.has_role
DROP POLICY IF EXISTS onboarding_docs_read ON storage.objects;
DROP POLICY IF EXISTS onboarding_docs_insert ON storage.objects;
DROP POLICY IF EXISTS onboarding_docs_delete ON storage.objects;

CREATE POLICY onboarding_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'onboarding-documents'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'it_admin'::app_role)
      OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = auth.uid() AND (storage.foldername(objects.name))[1] = e.id::text)
    )
  );

CREATE POLICY onboarding_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'onboarding-documents'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = auth.uid() AND (storage.foldername(objects.name))[1] = e.id::text)
    )
  );

CREATE POLICY onboarding_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'onboarding-documents'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = auth.uid() AND (storage.foldername(objects.name))[1] = e.id::text)
    )
  );

-- Remove public.has_role exposure now that nothing depends on it
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

-- Restrict org_settings reads to HR admins (contains EIN, SSO metadata)
DROP POLICY IF EXISTS "auth read settings" ON public.org_settings;
CREATE POLICY "hr read settings" ON public.org_settings
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role));

-- Employee self-read policies. Employees linked to auth users by personal_email.
CREATE POLICY "employee read own benefits" ON public.benefits_handoffs
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE personal_email = auth.email()));

CREATE POLICY "employee read own dependents" ON public.dependents
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE personal_email = auth.email()));

CREATE POLICY "employee read own certifications" ON public.employee_certifications
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE personal_email = auth.email()));

CREATE POLICY "employee read own training" ON public.employee_training
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE personal_email = auth.email()));

CREATE POLICY "employee read own equipment" ON public.equipment_issuance
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE personal_email = auth.email()));

CREATE POLICY "employee read own ppe" ON public.ppe_sizing
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE personal_email = auth.email()));

CREATE POLICY "employee read own screenings" ON public.screenings
  FOR SELECT TO authenticated
  USING (employee_id IN (SELECT id FROM public.employees WHERE personal_email = auth.email()));
