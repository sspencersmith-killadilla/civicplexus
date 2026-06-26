DROP POLICY IF EXISTS "ac read" ON public.approval_chains;
CREATE POLICY "ac read" ON public.approval_chains FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(), 'hr_admin'::app_role)
  OR (created_by = auth.uid())
  OR private.user_is_chain_approver(id, auth.uid())
);

DROP POLICY IF EXISTS "as read" ON public.approval_steps;
CREATE POLICY "as read" ON public.approval_steps FOR SELECT TO authenticated USING (
  private.has_role(auth.uid(), 'hr_admin'::app_role)
  OR (approver_id = auth.uid())
  OR private.user_owns_chain(chain_id, auth.uid())
);

REVOKE SELECT ON public.approval_chains FROM anon;
REVOKE SELECT ON public.approval_steps FROM anon;