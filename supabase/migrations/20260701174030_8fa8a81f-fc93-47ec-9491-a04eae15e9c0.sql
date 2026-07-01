
DROP POLICY IF EXISTS "official photos public read" ON storage.objects;
DROP POLICY IF EXISTS "official photos manage" ON storage.objects;
DROP POLICY IF EXISTS "official docs read" ON storage.objects;
DROP POLICY IF EXISTS "official docs manage" ON storage.objects;

CREATE POLICY "official photos public read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'official-photos');
CREATE POLICY "official photos manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'official-photos' AND public.can_manage_officials(auth.uid()))
  WITH CHECK (bucket_id = 'official-photos' AND public.can_manage_officials(auth.uid()));
CREATE POLICY "official docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'official-documents' AND public.can_manage_officials(auth.uid()));
CREATE POLICY "official docs manage" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'official-documents' AND public.can_manage_officials(auth.uid()))
  WITH CHECK (bucket_id = 'official-documents' AND public.can_manage_officials(auth.uid()));
