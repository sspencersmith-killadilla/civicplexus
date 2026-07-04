-- Restrict volunteers table writes/reads to HR admins (public intake INSERT remains for anon submissions)
DROP POLICY IF EXISTS "auth read volunteers" ON public.volunteers;
DROP POLICY IF EXISTS "auth write volunteers" ON public.volunteers;
DROP POLICY IF EXISTS "auth update volunteers" ON public.volunteers;
DROP POLICY IF EXISTS "auth delete volunteers" ON public.volunteers;

CREATE POLICY "hr read volunteers" ON public.volunteers
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "hr insert volunteers" ON public.volunteers
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "hr update volunteers" ON public.volunteers
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE POLICY "hr delete volunteers" ON public.volunteers
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role));