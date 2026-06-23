
CREATE OR REPLACE FUNCTION public.decide_paf_step(_step_id uuid, _decision text, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  _uid uuid := auth.uid();
  _step public.approval_steps%ROWTYPE;
  _chain public.approval_chains%ROWTYPE;
  _paf public.personnel_actions%ROWTYPE;
  _next public.approval_steps%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _step FROM public.approval_steps WHERE id = _step_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Step not found'; END IF;
  IF _step.status <> 'pending' THEN RAISE EXCEPTION 'Step already decided'; END IF;

  IF NOT (
    _step.approver_id = _uid
    OR (_step.approver_role IS NOT NULL AND private.has_role(_uid, _step.approver_role::app_role))
    OR private.has_role(_uid, 'hr_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to decide this step';
  END IF;

  UPDATE public.approval_steps
     SET status = _decision, decided_by = _uid, decided_at = now(),
         decision_notes = COALESCE(_notes, decision_notes)
   WHERE id = _step_id;

  SELECT * INTO _chain FROM public.approval_chains WHERE id = _step.chain_id;
  SELECT * INTO _paf FROM public.personnel_actions WHERE approval_chain_id = _chain.id LIMIT 1;

  IF _decision = 'denied' THEN
    UPDATE public.personnel_actions SET status = 'denied' WHERE id = _paf.id;
    RETURN;
  END IF;

  SELECT * INTO _next FROM public.approval_steps
    WHERE chain_id = _chain.id AND status = 'pending'
    ORDER BY stage ASC LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.personnel_actions SET status = 'approved' WHERE id = _paf.id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_paf_step(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_paf_step(uuid, text, text) TO authenticated;
