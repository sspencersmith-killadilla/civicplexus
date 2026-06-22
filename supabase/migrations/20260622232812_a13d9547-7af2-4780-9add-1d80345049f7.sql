
CREATE POLICY "job-applications storage read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-applications' AND (
      private.has_role(auth.uid(),'hr_admin'::app_role) OR
      private.has_role(auth.uid(),'hiring_manager'::app_role) OR
      private.has_role(auth.uid(),'supervisor'::app_role)
    )
  );
CREATE POLICY "job-applications storage insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-applications');
