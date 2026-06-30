
CREATE POLICY "iv_media_oneway_hr_read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'interview-media-oneway' AND public.is_iv_manager(auth.uid())
);
CREATE POLICY "iv_media_live_hr_read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'interview-media-live' AND public.is_iv_manager(auth.uid())
);
CREATE POLICY "iv_media_oneway_hr_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'interview-media-oneway' AND public.is_iv_manager(auth.uid())
);
CREATE POLICY "iv_media_live_hr_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'interview-media-live' AND public.is_iv_manager(auth.uid())
);
