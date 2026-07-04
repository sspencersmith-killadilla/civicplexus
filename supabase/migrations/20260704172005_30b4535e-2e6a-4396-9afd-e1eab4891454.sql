
-- 1. Link volunteers to auth users
ALTER TABLE public.volunteers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS volunteers_user_id_key ON public.volunteers(user_id) WHERE user_id IS NOT NULL;

-- 2. Volunteer self-service policies on volunteers
DROP POLICY IF EXISTS "volunteer read own" ON public.volunteers;
CREATE POLICY "volunteer read own" ON public.volunteers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "volunteer insert own" ON public.volunteers;
CREATE POLICY "volunteer insert own" ON public.volunteers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "volunteer update own" ON public.volunteers;
CREATE POLICY "volunteer update own" ON public.volunteers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. Volunteer self-service policies on volunteer_shift_signups
DROP POLICY IF EXISTS "volunteer view own signups" ON public.volunteer_shift_signups;
CREATE POLICY "volunteer view own signups" ON public.volunteer_shift_signups
  FOR SELECT TO authenticated
  USING (volunteer_id IN (SELECT id FROM public.volunteers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "volunteer create own signup" ON public.volunteer_shift_signups;
CREATE POLICY "volunteer create own signup" ON public.volunteer_shift_signups
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND volunteer_id IN (SELECT id FROM public.volunteers WHERE user_id = auth.uid())
  );

-- 4. Volunteer self-service policies on volunteer_clock_events
DROP POLICY IF EXISTS "volunteer view own clock events" ON public.volunteer_clock_events;
CREATE POLICY "volunteer view own clock events" ON public.volunteer_clock_events
  FOR SELECT TO authenticated
  USING (
    signup_id IN (
      SELECT s.id FROM public.volunteer_shift_signups s
      JOIN public.volunteers v ON v.id = s.volunteer_id
      WHERE v.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "volunteer insert own clock event" ON public.volunteer_clock_events;
CREATE POLICY "volunteer insert own clock event" ON public.volunteer_clock_events
  FOR INSERT TO authenticated
  WITH CHECK (
    signup_id IN (
      SELECT s.id FROM public.volunteer_shift_signups s
      JOIN public.volunteers v ON v.id = s.volunteer_id
      WHERE v.user_id = auth.uid() AND s.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "volunteer update own open clock event" ON public.volunteer_clock_events;
CREATE POLICY "volunteer update own open clock event" ON public.volunteer_clock_events
  FOR UPDATE TO authenticated
  USING (
    signup_id IN (
      SELECT s.id FROM public.volunteer_shift_signups s
      JOIN public.volunteers v ON v.id = s.volunteer_id
      WHERE v.user_id = auth.uid()
    )
  )
  WITH CHECK (
    signup_id IN (
      SELECT s.id FROM public.volunteer_shift_signups s
      JOIN public.volunteers v ON v.id = s.volunteer_id
      WHERE v.user_id = auth.uid()
    )
  );
