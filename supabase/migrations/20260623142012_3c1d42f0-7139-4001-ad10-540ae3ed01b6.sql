
-- Lock down newly created SECURITY DEFINER trigger functions
REVOKE EXECUTE ON FUNCTION public.tg_employees_autoassign_training() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_training_complete() FROM PUBLIC, anon, authenticated;

-- Storage policies for training-evidence bucket
DROP POLICY IF EXISTS "training_evidence_employee_rw" ON storage.objects;
CREATE POLICY "training_evidence_employee_rw" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'training-evidence'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND (storage.foldername(objects.name))[1] = e.id::text
    )
  )
  WITH CHECK (
    bucket_id = 'training-evidence'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND (storage.foldername(objects.name))[1] = e.id::text
    )
  );

DROP POLICY IF EXISTS "training_evidence_hr_read" ON storage.objects;
CREATE POLICY "training_evidence_hr_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'training-evidence'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    )
  );

DROP POLICY IF EXISTS "training_evidence_supervisor_read" ON storage.objects;
CREATE POLICY "training_evidence_supervisor_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'training-evidence'
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.manager_id = auth.uid()
        AND (storage.foldername(objects.name))[1] = e.id::text
    )
  );
