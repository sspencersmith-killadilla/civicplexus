
-- 1) New permission keys
INSERT INTO public.permission_keys(key, label, category, description) VALUES
  ('one_on_ones.manage',       'Manage 1-on-1s',                  '1-on-1s', 'Schedule, edit, and read any 1-on-1 session and its notes'),
  ('one_on_ones.read.reports', 'Read 1-on-1s for report chain',   '1-on-1s', 'Read 1-on-1s for anyone in the caller''s direct or transitive reporting chain'),
  ('applications.read',        'Read job applications',           'Hiring',  'Read applications and messages across postings'),
  ('applications.write',       'Update job applications',         'Hiring',  'Change application status, add recruiter messages'),
  ('interviews.manage',        'Manage interviews',               'Hiring',  'Read/write interviews and feedback'),
  ('screenings.read',          'Read AI screenings',              'Hiring',  'Read AI-generated screening results')
ON CONFLICT (key) DO NOTHING;

-- 2) Seed system groups (idempotent) + attach keys
INSERT INTO public.permission_groups(name, description, is_system)
  VALUES ('Hiring team', 'Recruiters and hiring team members: read applications, interviews, screenings, kits', true)
  ON CONFLICT (name) DO NOTHING;
INSERT INTO public.permission_groups(name, description, is_system)
  VALUES ('People manager+', 'Managers who need visibility into their full reporting chain''s 1-on-1s', true)
  ON CONFLICT (name) DO NOTHING;

WITH g AS (SELECT id FROM public.permission_groups WHERE name='Hiring team')
INSERT INTO public.permission_group_keys(group_id, permission_key)
SELECT g.id, k FROM g, unnest(ARRAY['applications.read','applications.write','interviews.manage','screenings.read','interview_kits.read','job_requisitions.read.internal']) k
ON CONFLICT DO NOTHING;

WITH g AS (SELECT id FROM public.permission_groups WHERE name='People manager+')
INSERT INTO public.permission_group_keys(group_id, permission_key)
SELECT g.id, k FROM g, unnest(ARRAY['one_on_ones.manage','one_on_ones.read.reports']) k
ON CONFLICT DO NOTHING;

-- 3) Helper: transitive report check (does _employee_id report into _manager_uid?)
CREATE OR REPLACE FUNCTION private.reports_into(_manager_uid uuid, _employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public','private'
AS $$
  WITH RECURSIVE chain AS (
    SELECT e.id, e.manager_id
      FROM public.employees e
     WHERE e.id = _employee_id
    UNION ALL
    SELECT e.id, e.manager_id
      FROM public.employees e
      JOIN chain c ON c.manager_id = e.id
  )
  SELECT EXISTS (
    SELECT 1
      FROM chain c
      JOIN public.employees m ON m.id = c.manager_id
     WHERE m.user_id = _manager_uid
  );
$$;

-- 4) Additive permission-based RLS policies (existing role/relationship policies stay in place)

-- one_on_ones
DROP POLICY IF EXISTS "1on1 permission manage all" ON public.one_on_ones;
CREATE POLICY "1on1 permission manage all" ON public.one_on_ones
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_permission('one_on_ones.manage'))
  WITH CHECK (public.has_permission('one_on_ones.manage'));

DROP POLICY IF EXISTS "1on1 permission read reports" ON public.one_on_ones;
CREATE POLICY "1on1 permission read reports" ON public.one_on_ones
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.has_permission('one_on_ones.read.reports')
    AND employee_id IS NOT NULL
    AND private.reports_into(auth.uid(), employee_id)
  );

-- 1-on-1 child tables mirror manage
DROP POLICY IF EXISTS "1on1 notes permission manage" ON public.one_on_one_notes;
CREATE POLICY "1on1 notes permission manage" ON public.one_on_one_notes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_permission('one_on_ones.manage'))
  WITH CHECK (public.has_permission('one_on_ones.manage'));

DROP POLICY IF EXISTS "1on1 agenda permission manage" ON public.one_on_one_agenda_notes;
CREATE POLICY "1on1 agenda permission manage" ON public.one_on_one_agenda_notes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_permission('one_on_ones.manage'))
  WITH CHECK (public.has_permission('one_on_ones.manage'));

DROP POLICY IF EXISTS "1on1 action items permission manage" ON public.one_on_one_action_items;
CREATE POLICY "1on1 action items permission manage" ON public.one_on_one_action_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_permission('one_on_ones.manage'))
  WITH CHECK (public.has_permission('one_on_ones.manage'));

-- job_applications
DROP POLICY IF EXISTS "job_applications permission read" ON public.job_applications;
CREATE POLICY "job_applications permission read" ON public.job_applications
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_permission('applications.read'));

DROP POLICY IF EXISTS "job_applications permission write" ON public.job_applications;
CREATE POLICY "job_applications permission write" ON public.job_applications
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.has_permission('applications.write'))
  WITH CHECK (public.has_permission('applications.write'));

-- application_messages
DROP POLICY IF EXISTS "application_messages permission read" ON public.application_messages;
CREATE POLICY "application_messages permission read" ON public.application_messages
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_permission('applications.read'));

DROP POLICY IF EXISTS "application_messages permission write" ON public.application_messages;
CREATE POLICY "application_messages permission write" ON public.application_messages
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('applications.write'));

-- interviews
DROP POLICY IF EXISTS "interviews permission manage" ON public.interviews;
CREATE POLICY "interviews permission manage" ON public.interviews
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_permission('interviews.manage'))
  WITH CHECK (public.has_permission('interviews.manage'));

DROP POLICY IF EXISTS "interview_feedback permission manage" ON public.interview_feedback;
CREATE POLICY "interview_feedback permission manage" ON public.interview_feedback
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_permission('interviews.manage'))
  WITH CHECK (public.has_permission('interviews.manage'));

-- screenings
DROP POLICY IF EXISTS "screenings permission read" ON public.screenings;
CREATE POLICY "screenings permission read" ON public.screenings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_permission('screenings.read'));
