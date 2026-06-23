CREATE POLICY "HR admins delete offer letters"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'offer-letters' AND private.has_role(auth.uid(), 'hr_admin'::app_role));