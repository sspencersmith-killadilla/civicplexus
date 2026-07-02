UPDATE public.org_settings SET
  org_name = 'City of Noöpolis, Texas',
  address = '100 Civic Plaza, Noöpolis, TX 78640',
  phone = '(512) 555-0100',
  primary_color = '#1a2942',
  accent_color = '#c9a961',
  fed_employer_id = '74-6000000',
  payroll_bureau = 'ADP WFN',
  tmrs_member_rate_pct = 7.00,
  tmrs_employer_match_pct = 2.00
WHERE singleton = true;

UPDATE public.official_bodies
  SET accepting_applications = true,
      application_instructions = 'Applications are reviewed monthly by City Council. Please include a brief statement of interest.'
WHERE slug IN ('library-board','parks-rec-board','planning-zoning');

UPDATE public.official_bodies SET roster_public = true
WHERE slug IN ('city-council','planning-zoning','library-board','parks-rec-board','zoning-board-of-adjustment','ethics-review-commission','historic-preservation-commission','edc-type-a','edc-type-b','airport-advisory-board','civil-service-commission');