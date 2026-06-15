
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.form_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  version text NOT NULL DEFAULT '1',
  title text NOT NULL,
  description text,
  jurisdiction text DEFAULT 'US-Federal',
  schema jsonb NOT NULL DEFAULT '{"fields":[]}'::jsonb,
  requires_signature boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_definitions TO authenticated;
GRANT ALL ON public.form_definitions TO service_role;
ALTER TABLE public.form_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "form_defs_read_all_auth" ON public.form_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "form_defs_hr_write" ON public.form_definitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));

CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_definition_id uuid NOT NULL REFERENCES public.form_definitions(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  task_instance_id uuid REFERENCES public.task_instances(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions TO authenticated;
GRANT ALL ON public.form_submissions TO service_role;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submissions_owner_rw" ON public.form_submissions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = form_submissions.employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'hr_admin')
    OR public.has_role(auth.uid(), 'hiring_manager')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = form_submissions.employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'hr_admin')
  );

CREATE TABLE public.signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  signer_user_id uuid REFERENCES auth.users(id),
  signer_name text NOT NULL,
  signer_role text,
  signature_data text NOT NULL,
  signature_type text NOT NULL DEFAULT 'typed',
  ip_address text,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.signatures TO authenticated;
GRANT ALL ON public.signatures TO service_role;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signatures_read" ON public.signatures FOR SELECT TO authenticated USING (
  signer_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'hr_admin')
  OR EXISTS (
    SELECT 1 FROM public.form_submissions fs
    JOIN public.employees e ON e.id = fs.employee_id
    WHERE fs.id = signatures.form_submission_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY "signatures_insert_self" ON public.signatures FOR INSERT TO authenticated WITH CHECK (signer_user_id = auth.uid());

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  task_instance_id uuid REFERENCES public.task_instances(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id),
  is_sensitive boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_rw" ON public.documents FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = documents.employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'hr_admin')
    OR public.has_role(auth.uid(), 'it_admin')
    OR public.has_role(auth.uid(), 'hiring_manager')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = documents.employee_id AND e.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'hr_admin')
  );

CREATE TABLE public.provisioning_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  task_instance_id uuid REFERENCES public.task_instances(id) ON DELETE SET NULL,
  kind text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  assignee_user_id uuid REFERENCES auth.users(id),
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provisioning_requests TO authenticated;
GRANT ALL ON public.provisioning_requests TO service_role;
ALTER TABLE public.provisioning_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prov_read" ON public.provisioning_requests FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'it_admin')
  OR public.has_role(auth.uid(), 'hr_admin')
  OR public.has_role(auth.uid(), 'hiring_manager')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = provisioning_requests.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "prov_write" ON public.provisioning_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin') OR public.has_role(auth.uid(), 'hr_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'it_admin') OR public.has_role(auth.uid(), 'hr_admin'));

ALTER TABLE public.task_instances
  ADD COLUMN IF NOT EXISTS form_submission_id uuid REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provisioning_request_id uuid REFERENCES public.provisioning_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS form_definition_key text;

CREATE TRIGGER fd_updated BEFORE UPDATE ON public.form_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER fs_updated BEFORE UPDATE ON public.form_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER pr_updated BEFORE UPDATE ON public.provisioning_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.form_definitions (key, version, title, description, jurisdiction, requires_signature, schema) VALUES
('i9', '2024', 'Form I-9 — Employment Eligibility Verification', 'Federal employment eligibility verification (USCIS).', 'US-Federal', true, '{
  "sections":[
    {"title":"Section 1 — Employee Information and Attestation","fields":[
      {"key":"last_name","label":"Last name","type":"text","required":true},
      {"key":"first_name","label":"First name","type":"text","required":true},
      {"key":"middle_initial","label":"Middle initial","type":"text"},
      {"key":"other_last_names","label":"Other last names used","type":"text"},
      {"key":"address","label":"Address","type":"text","required":true},
      {"key":"apt_number","label":"Apt number","type":"text"},
      {"key":"city","label":"City","type":"text","required":true},
      {"key":"state","label":"State","type":"text","required":true},
      {"key":"zip","label":"ZIP","type":"text","required":true},
      {"key":"dob","label":"Date of birth","type":"date","required":true},
      {"key":"ssn","label":"Social Security Number","type":"text","required":true,"sensitive":true},
      {"key":"email","label":"Email","type":"email"},
      {"key":"phone","label":"Phone","type":"tel"},
      {"key":"citizenship","label":"Citizenship / immigration status","type":"select","required":true,"options":[
        {"value":"citizen","label":"A citizen of the United States"},
        {"value":"noncitizen_national","label":"A noncitizen national of the United States"},
        {"value":"lpr","label":"A lawful permanent resident"},
        {"value":"alien_authorized","label":"An alien authorized to work"}
      ]},
      {"key":"alien_number","label":"USCIS A-Number / Alien Registration","type":"text"}
    ]}
  ]
}'::jsonb),
('w4', '2024', 'Form W-4 — Employee Withholding Certificate', 'Federal income tax withholding (IRS).', 'US-Federal', true, '{
  "sections":[
    {"title":"Step 1 — Personal Information","fields":[
      {"key":"first_name","label":"First name","type":"text","required":true},
      {"key":"last_name","label":"Last name","type":"text","required":true},
      {"key":"ssn","label":"Social Security Number","type":"text","required":true,"sensitive":true},
      {"key":"address","label":"Address","type":"text","required":true},
      {"key":"city_state_zip","label":"City, State, ZIP","type":"text","required":true},
      {"key":"filing_status","label":"Filing status","type":"select","required":true,"options":[
        {"value":"single","label":"Single or Married filing separately"},
        {"value":"mfj","label":"Married filing jointly"},
        {"value":"hoh","label":"Head of household"}
      ]}
    ]},
    {"title":"Step 2 — Multiple Jobs (optional)","fields":[
      {"key":"multiple_jobs","label":"Holds more than one job, or spouse also works","type":"boolean"}
    ]},
    {"title":"Step 3 — Dependents","fields":[
      {"key":"qualifying_children_credit","label":"Qualifying children under 17 × $2,000","type":"number"},
      {"key":"other_dependents_credit","label":"Other dependents × $500","type":"number"}
    ]},
    {"title":"Step 4 — Other Adjustments","fields":[
      {"key":"other_income","label":"Other income (not from jobs)","type":"number"},
      {"key":"deductions","label":"Deductions","type":"number"},
      {"key":"extra_withholding","label":"Extra withholding per pay period","type":"number"}
    ]}
  ]
}'::jsonb),
('emergency_contact', '1', 'Emergency Contact Information', 'Primary and secondary emergency contacts.', 'US', false, '{
  "sections":[{"title":"Primary contact","fields":[
    {"key":"primary_name","label":"Full name","type":"text","required":true},
    {"key":"primary_relationship","label":"Relationship","type":"text","required":true},
    {"key":"primary_phone","label":"Phone","type":"tel","required":true},
    {"key":"primary_email","label":"Email","type":"email"}
  ]},{"title":"Secondary contact","fields":[
    {"key":"secondary_name","label":"Full name","type":"text"},
    {"key":"secondary_relationship","label":"Relationship","type":"text"},
    {"key":"secondary_phone","label":"Phone","type":"tel"}
  ]}]
}'::jsonb),
('direct_deposit', '1', 'Direct Deposit Authorization', 'Routing and account information for payroll.', 'US', true, '{
  "sections":[{"title":"Bank details","fields":[
    {"key":"bank_name","label":"Bank name","type":"text","required":true},
    {"key":"account_type","label":"Account type","type":"select","required":true,"options":[
      {"value":"checking","label":"Checking"},{"value":"savings","label":"Savings"}
    ]},
    {"key":"routing","label":"Routing number","type":"text","required":true,"sensitive":true},
    {"key":"account","label":"Account number","type":"text","required":true,"sensitive":true}
  ]}]
}'::jsonb);
