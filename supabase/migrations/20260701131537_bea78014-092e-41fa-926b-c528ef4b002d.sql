-- Applicant pool support: HR admins can review all AI screening and parsed-resume records.
DROP POLICY IF EXISTS "ai_suggestions: hr admin all" ON public.ai_suggestions;
CREATE POLICY "ai_suggestions: hr admin all"
  ON public.ai_suggestions
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "application_ai_parse: hr admin all" ON public.application_ai_parse;
CREATE POLICY "application_ai_parse: hr admin all"
  ON public.application_ai_parse
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));