
-- Switch view to security_invoker so it uses the caller's privileges
ALTER VIEW public.job_requisitions_public SET (security_invoker = on);

-- Grant column-level SELECT on the safe subset only
GRANT SELECT
  (id, slug, title, department, location, employment_type,
   summary, description, requirements, benefits,
   posting_sections, posted_at, closes_at,
   salary_min, salary_max, brochure_url,
   status, internal_only)
  ON public.job_requisitions TO anon;

-- Restore a scoped anon SELECT policy (row-level) so the view can read
-- posted, public rows. Column privileges above prevent access to any
-- internal columns even if a query tries them.
DROP POLICY IF EXISTS "req public read" ON public.job_requisitions;
CREATE POLICY "req public read"
  ON public.job_requisitions
  FOR SELECT
  TO anon
  USING (status = 'posted' AND internal_only = false);
