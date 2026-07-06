-- 1) Restrict SELECT on ai_settings to hr_admin / it_admin
DROP POLICY IF EXISTS "read ai settings" ON public.ai_settings;

CREATE POLICY "admins read ai settings"
ON public.ai_settings
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'hr_admin'::app_role)
  OR private.has_role(auth.uid(), 'it_admin'::app_role)
);

-- 2) Official photos: only public if the official opted to publish
DROP POLICY IF EXISTS "official photos public read" ON storage.objects;

CREATE POLICY "official photos public read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'official-photos'
  AND (storage.foldername(name))[1] = 'photos'
  AND EXISTS (
    SELECT 1 FROM public.officials o
    WHERE o.id::text = (storage.foldername(objects.name))[2]
      AND o.publish_photo = true
  )
);