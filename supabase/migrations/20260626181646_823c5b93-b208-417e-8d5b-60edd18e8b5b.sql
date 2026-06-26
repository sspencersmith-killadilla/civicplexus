
ALTER TABLE public.job_requisitions ADD COLUMN IF NOT EXISTS brochure_url text;
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS careers_page_html text;
ALTER TABLE public.org_settings ADD COLUMN IF NOT EXISTS careers_page_css text;

DROP POLICY IF EXISTS "careers brochures hr read" ON storage.objects;
CREATE POLICY "careers brochures hr read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'careers-brochures' AND private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "careers brochures hr write" ON storage.objects;
CREATE POLICY "careers brochures hr write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'careers-brochures' AND private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "careers brochures hr update" ON storage.objects;
CREATE POLICY "careers brochures hr update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'careers-brochures' AND private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "careers brochures hr delete" ON storage.objects;
CREATE POLICY "careers brochures hr delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'careers-brochures' AND private.has_role(auth.uid(), 'hr_admin'::app_role));
