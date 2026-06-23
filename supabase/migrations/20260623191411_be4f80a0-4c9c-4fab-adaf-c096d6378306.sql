
-- 1) paf_audit: drop open insert; add SECURITY DEFINER RPC that verifies relationship
DROP POLICY IF EXISTS "Insert paf audit via app" ON public.paf_audit;

CREATE OR REPLACE FUNCTION public.record_paf_audit(
  _paf_id uuid,
  _event_type text,
  _from_status text DEFAULT NULL,
  _to_status text DEFAULT NULL,
  _payload jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _uid uuid := auth.uid();
  _allowed boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT (
    private.has_role(_uid, 'hr_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.personnel_actions pa WHERE pa.id = _paf_id AND pa.initiated_by = _uid)
    OR EXISTS (
      SELECT 1 FROM public.personnel_actions pa
      WHERE pa.id = _paf_id
        AND pa.employee_id IN (SELECT id FROM public.employees WHERE manager_id = _uid)
    )
    OR EXISTS (
      SELECT 1 FROM public.approval_steps s
      JOIN public.approval_chains c ON c.id = s.chain_id
      JOIN public.personnel_actions pa ON pa.approval_chain_id = c.id
      WHERE pa.id = _paf_id AND s.approver_id = _uid
    )
  ) INTO _allowed;
  IF NOT _allowed THEN RAISE EXCEPTION 'Not authorized to record audit for this PAF'; END IF;
  INSERT INTO public.paf_audit(paf_id, actor_id, event_type, from_status, to_status, payload)
  VALUES (_paf_id, _uid, _event_type, _from_status, _to_status, _payload)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.record_paf_audit(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_paf_audit(uuid, text, text, text, jsonb) TO authenticated;

-- 2) comp_review_participants: fix broken manager policies
DROP POLICY IF EXISTS "manager reads own team crp" ON public.comp_review_participants;
DROP POLICY IF EXISTS "manager updates own team crp" ON public.comp_review_participants;

CREATE POLICY "manager reads own team crp"
  ON public.comp_review_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = comp_review_participants.employee_id
        AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "manager updates own team crp"
  ON public.comp_review_participants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = comp_review_participants.employee_id
        AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = comp_review_participants.employee_id
        AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  );

-- 3) review_cycle_participants: fix broken manager branch in SELECT policy
DROP POLICY IF EXISTS "Managers see their reports' participation" ON public.review_cycle_participants;

CREATE POLICY "Managers see their reports' participation"
  ON public.review_cycle_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = review_cycle_participants.employee_id
        AND e.manager_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = review_cycle_participants.employee_id
        AND e.user_id = auth.uid()
    )
  );

-- 4) job_applications: add anon INSERT scoped to posted, public requisitions
CREATE POLICY "Anon applies to public postings"
  ON public.job_applications FOR INSERT
  TO anon
  WITH CHECK (
    is_internal = false
    AND requisition_id IN (
      SELECT id FROM public.job_requisitions
      WHERE status = 'posted' AND internal_only = false
    )
  );
GRANT INSERT ON public.job_applications TO anon;
