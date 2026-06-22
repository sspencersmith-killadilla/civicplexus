
-- approval_chains: restrict SELECT
DROP POLICY IF EXISTS "ac read" ON public.approval_chains;
CREATE POLICY "ac read" ON public.approval_chains
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.approval_steps s
      WHERE s.chain_id = approval_chains.id
        AND s.approver_id = auth.uid()
    )
  );

-- approval_steps: restrict SELECT
DROP POLICY IF EXISTS "as read" ON public.approval_steps;
CREATE POLICY "as read" ON public.approval_steps
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.approval_chains c
      WHERE c.id = approval_steps.chain_id
        AND c.created_by = auth.uid()
    )
  );

-- performance_review_signatures: restrict SELECT to employee, manager, HR
DROP POLICY IF EXISTS "Read sigs for accessible reviews" ON public.performance_review_signatures;
CREATE POLICY "Read sigs for accessible reviews" ON public.performance_review_signatures
  FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.performance_reviews pr
      WHERE pr.id = performance_review_signatures.review_id
        AND (
          pr.manager_user_id = auth.uid()
          OR pr.employee_id IN (SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid())
        )
    )
  );

-- storage.objects: tighten job-applications bucket policies
DROP POLICY IF EXISTS "job-applications storage insert" ON storage.objects;
CREATE POLICY "job-applications storage insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-applications'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    )
  );

CREATE POLICY "job-applications storage update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'job-applications'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'job-applications'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    )
  );

CREATE POLICY "job-applications storage delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'job-applications'
    AND (
      private.has_role(auth.uid(), 'hr_admin'::app_role)
      OR private.has_role(auth.uid(), 'hiring_manager'::app_role)
    )
  );
