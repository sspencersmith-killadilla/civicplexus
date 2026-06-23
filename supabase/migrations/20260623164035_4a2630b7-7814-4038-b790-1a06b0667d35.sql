
CREATE POLICY "HR admins read payroll exports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payroll-exports' AND private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "HR admins write payroll exports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payroll-exports' AND private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "HR admins update payroll exports"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'payroll-exports' AND private.has_role(auth.uid(), 'hr_admin'::app_role));
CREATE POLICY "HR admins delete payroll exports"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payroll-exports' AND private.has_role(auth.uid(), 'hr_admin'::app_role));
