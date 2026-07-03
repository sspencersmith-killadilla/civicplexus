
DROP POLICY IF EXISTS "Anyone with signup can clock via PIN" ON public.volunteer_clock_events;
DROP POLICY IF EXISTS "Anyone can update own clock event" ON public.volunteer_clock_events;
DROP POLICY IF EXISTS "Public read own clock events by signup" ON public.volunteer_clock_events;
REVOKE INSERT, UPDATE, SELECT ON public.volunteer_clock_events FROM anon;
CREATE POLICY "Auth view clock events" ON public.volunteer_clock_events FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role) OR private.has_role(auth.uid(),'hiring_manager'::app_role) OR private.has_role(auth.uid(),'supervisor'::app_role));
CREATE POLICY "HR manage clock events" ON public.volunteer_clock_events FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'hr_admin'::app_role)) WITH CHECK (private.has_role(auth.uid(),'hr_admin'::app_role));
