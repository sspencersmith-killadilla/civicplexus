
CREATE OR REPLACE FUNCTION private.user_is_chain_approver(_chain_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.approval_steps s WHERE s.chain_id = _chain_id AND s.approver_id = _uid)
$$;

CREATE OR REPLACE FUNCTION private.user_owns_chain(_chain_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.approval_chains c WHERE c.id = _chain_id AND c.created_by = _uid)
$$;

DROP POLICY IF EXISTS "ac read" ON public.approval_chains;
CREATE POLICY "ac read" ON public.approval_chains FOR SELECT
USING (
  private.has_role(auth.uid(), 'hr_admin'::app_role)
  OR created_by = auth.uid()
  OR private.user_is_chain_approver(id, auth.uid())
);

DROP POLICY IF EXISTS "as read" ON public.approval_steps;
CREATE POLICY "as read" ON public.approval_steps FOR SELECT
USING (
  private.has_role(auth.uid(), 'hr_admin'::app_role)
  OR approver_id = auth.uid()
  OR private.user_owns_chain(chain_id, auth.uid())
);
