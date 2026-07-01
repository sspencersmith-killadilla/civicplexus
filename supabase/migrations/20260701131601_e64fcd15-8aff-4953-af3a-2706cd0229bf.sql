-- Hiring workflow support: HR admins can see/manage all internal recruiting activity.
DROP POLICY IF EXISTS "interviews: hr admin all" ON public.interviews;
CREATE POLICY "interviews: hr admin all"
  ON public.interviews
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "interview_feedback: hr admin all" ON public.interview_feedback;
CREATE POLICY "interview_feedback: hr admin all"
  ON public.interview_feedback
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "interview_rooms: hr admin all" ON public.interview_rooms;
CREATE POLICY "interview_rooms: hr admin all"
  ON public.interview_rooms
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "interview_invitations: hr admin all" ON public.interview_invitations;
CREATE POLICY "interview_invitations: hr admin all"
  ON public.interview_invitations
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "application_messages: hr admin all" ON public.application_messages;
CREATE POLICY "application_messages: hr admin all"
  ON public.application_messages
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "job_application_events: hr admin all" ON public.job_application_events;
CREATE POLICY "job_application_events: hr admin all"
  ON public.job_application_events
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "offers: hr admin all" ON public.offers;
CREATE POLICY "offers: hr admin all"
  ON public.offers
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "screenings: hr admin all" ON public.screenings;
CREATE POLICY "screenings: hr admin all"
  ON public.screenings
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

DROP POLICY IF EXISTS "hire_requests: hr admin all" ON public.hire_requests;
CREATE POLICY "hire_requests: hr admin all"
  ON public.hire_requests
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));