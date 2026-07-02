
ALTER TABLE public.documents ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS official_term_id uuid REFERENCES public.official_terms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_official_term ON public.documents(official_term_id);

ALTER TABLE public.documents ADD CONSTRAINT documents_owner_present CHECK (employee_id IS NOT NULL OR official_term_id IS NOT NULL) NOT VALID;

CREATE POLICY "documents_officials_rw" ON public.documents
  FOR ALL TO authenticated
  USING (official_term_id IS NOT NULL AND public.can_manage_officials(auth.uid()))
  WITH CHECK (official_term_id IS NOT NULL AND public.can_manage_officials(auth.uid()));

CREATE POLICY "documents_officials_self_read" ON public.documents
  FOR SELECT TO authenticated
  USING (
    official_term_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.official_terms t
      JOIN public.officials o ON o.id = t.official_id
      WHERE t.id = documents.official_term_id AND o.user_id = auth.uid()
    )
  );
