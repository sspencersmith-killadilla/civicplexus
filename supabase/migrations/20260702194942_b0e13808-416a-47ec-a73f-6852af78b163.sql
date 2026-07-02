
-- Finding 1: officials — anon SELECT policy leaked email/phone regardless of publish_contact.
-- Public roster is served by a SECURITY DEFINER server function that masks fields per publish flags,
-- so we drop the anon read policy entirely.
DROP POLICY IF EXISTS "of_public_read" ON public.officials;

-- Finding 2: official_terms — scope authenticated read to clerks/HR and the official themselves.
DROP POLICY IF EXISTS "ot_auth_read" ON public.official_terms;
CREATE POLICY "ot_auth_read" ON public.official_terms
  FOR SELECT TO authenticated
  USING (
    public.can_manage_officials(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.officials o
      WHERE o.id = official_terms.official_id AND o.user_id = auth.uid()
    )
  );

-- Also drop the anon SELECT on official_terms — same reason: public routes go through
-- the server function, not direct Data API reads. Not doing so would still leak bond/oath
-- fields anonymously for active terms on roster-public bodies.
DROP POLICY IF EXISTS "ot_public_read" ON public.official_terms;
