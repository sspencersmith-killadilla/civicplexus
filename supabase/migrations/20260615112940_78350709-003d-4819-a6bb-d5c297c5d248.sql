
CREATE POLICY "onboarding_docs_read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'onboarding-documents' AND (
    public.has_role(auth.uid(), 'hr_admin')
    OR public.has_role(auth.uid(), 'it_admin')
    OR public.has_role(auth.uid(), 'hiring_manager')
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid() AND (storage.foldername(name))[1] = e.id::text
    )
  )
);
CREATE POLICY "onboarding_docs_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'onboarding-documents' AND (
    public.has_role(auth.uid(), 'hr_admin')
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid() AND (storage.foldername(name))[1] = e.id::text
    )
  )
);
CREATE POLICY "onboarding_docs_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'onboarding-documents' AND (
    public.has_role(auth.uid(), 'hr_admin')
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.user_id = auth.uid() AND (storage.foldername(name))[1] = e.id::text
    )
  )
);
