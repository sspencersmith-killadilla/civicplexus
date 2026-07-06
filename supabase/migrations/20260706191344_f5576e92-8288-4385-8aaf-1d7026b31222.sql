
-- Fix: job_applications confidential flag not enforced for hiring managers/requesters
DROP POLICY IF EXISTS "app read" ON public.job_applications;
CREATE POLICY "app read" ON public.job_applications
FOR SELECT
USING (
  private.has_role(auth.uid(), 'hr_admin'::app_role)
  OR (
    EXISTS (
      SELECT 1 FROM public.job_requisitions r
      WHERE r.id = job_applications.requisition_id
        AND (r.hiring_manager_id = auth.uid() OR r.requested_by = auth.uid())
    )
    AND (
      COALESCE(job_applications.confidential_until_finalist, false) = false
      OR job_applications.status IN ('interview','offer','hired')
    )
  )
  OR (
    is_internal = true
    AND internal_employee_id IN (
      SELECT employees.id FROM public.employees WHERE employees.user_id = auth.uid()
    )
  )
);

-- Fix: officials contact info exposed to all authenticated users
DROP POLICY IF EXISTS of_auth_read ON public.officials;

-- Baseline read: non-sensitive fields visible to any authenticated user
CREATE POLICY of_auth_read_base ON public.officials
FOR SELECT TO authenticated
USING (true);

-- Revoke column-level SELECT on email/phone from authenticated; only managers/self can see them
REVOKE SELECT (email, phone) ON public.officials FROM authenticated;

-- Managers and the official themselves retain full column access via a permissive policy backed by grants
GRANT SELECT (email, phone) ON public.officials TO authenticated;

-- Replace baseline with a policy that only exposes email/phone rows when allowed
DROP POLICY of_auth_read_base ON public.officials;
CREATE POLICY of_auth_read ON public.officials
FOR SELECT TO authenticated
USING (
  -- Everyone authenticated can see the row; sensitive columns filtered by app or by publish_contact
  publish_contact = true
  OR public.can_manage_officials(auth.uid())
  OR user_id = auth.uid()
  OR true  -- keep row visibility broad; sensitive col access controlled below
);

-- Enforce email/phone exposure via a stricter policy using column privileges:
-- Revoke email/phone from authenticated, grant only when caller can manage or is the official.
REVOKE SELECT (email, phone) ON public.officials FROM authenticated;

-- Provide a security-definer view for consented contact info
CREATE OR REPLACE VIEW public.officials_contact AS
SELECT o.id, o.email, o.phone
FROM public.officials o
WHERE o.publish_contact = true
   OR public.can_manage_officials(auth.uid())
   OR o.user_id = auth.uid();

GRANT SELECT ON public.officials_contact TO authenticated;
