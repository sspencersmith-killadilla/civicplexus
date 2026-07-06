
-- Restore any accidental column-privilege restrictions
GRANT SELECT ON public.officials TO authenticated;

-- Drop temporary artifacts from the prior migration
DROP VIEW IF EXISTS public.officials_contact;

-- Replace the SELECT policy with a consent-aware one
DROP POLICY IF EXISTS of_auth_read ON public.officials;
DROP POLICY IF EXISTS of_auth_read_base ON public.officials;

CREATE POLICY of_auth_read ON public.officials
FOR SELECT TO authenticated
USING (
  public.can_manage_officials(auth.uid())
  OR user_id = auth.uid()
  OR COALESCE(publish_contact, false) = true
);
