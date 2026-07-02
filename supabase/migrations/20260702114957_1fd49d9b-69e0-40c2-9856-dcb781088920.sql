CREATE POLICY "board_apps_staff_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'board-applications' AND public.is_clerk_or_hr(auth.uid()));

CREATE POLICY "board_apps_staff_write" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'board-applications' AND public.is_clerk_or_hr(auth.uid()))
WITH CHECK (bucket_id = 'board-applications' AND public.is_clerk_or_hr(auth.uid()));