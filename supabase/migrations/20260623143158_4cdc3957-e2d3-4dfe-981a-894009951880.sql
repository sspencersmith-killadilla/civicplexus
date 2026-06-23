
CREATE POLICY "HR admins read offer letters" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'offer-letters' AND private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE POLICY "HR admins write offer letters" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'offer-letters' AND private.has_role(auth.uid(),'hr_admin'::app_role));

CREATE POLICY "HR admins update offer letters" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'offer-letters' AND private.has_role(auth.uid(),'hr_admin'::app_role));
