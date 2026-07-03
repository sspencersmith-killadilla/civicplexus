
-- Volunteers
CREATE TABLE public.volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  department_id UUID,
  skills TEXT[] NOT NULL DEFAULT '{}',
  background_check_date DATE,
  waiver_signed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteers TO authenticated;
GRANT INSERT ON public.volunteers TO anon;
GRANT ALL ON public.volunteers TO service_role;
ALTER TABLE public.volunteers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read volunteers" ON public.volunteers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write volunteers" ON public.volunteers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update volunteers" ON public.volunteers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete volunteers" ON public.volunteers FOR DELETE TO authenticated USING (true);
CREATE POLICY "public volunteer intake" ON public.volunteers FOR INSERT TO anon WITH CHECK (status = 'pending');

CREATE TRIGGER trg_volunteers_updated BEFORE UPDATE ON public.volunteers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Volunteer hours
CREATE TABLE public.volunteer_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID NOT NULL REFERENCES public.volunteers(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  hours NUMERIC(6,2) NOT NULL,
  activity TEXT,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_hours TO authenticated;
GRANT ALL ON public.volunteer_hours TO service_role;
ALTER TABLE public.volunteer_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all volunteer_hours" ON public.volunteer_hours FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vendors
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  dba TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  tax_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  department_id UUID,
  contract_value NUMERIC(14,2),
  contract_start DATE,
  contract_end DATE,
  coi_expires_at DATE,
  insurance_verified BOOLEAN NOT NULL DEFAULT false,
  w9_path TEXT,
  coi_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT INSERT ON public.vendors TO anon;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read vendors" ON public.vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write vendors" ON public.vendors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update vendors" ON public.vendors FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete vendors" ON public.vendors FOR DELETE TO authenticated USING (true);
CREATE POLICY "public vendor intake" ON public.vendors FOR INSERT TO anon WITH CHECK (status = 'pending');

CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vendor assignments
CREATE TABLE public.vendor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  role TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_assignments TO authenticated;
GRANT ALL ON public.vendor_assignments TO service_role;
ALTER TABLE public.vendor_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all vendor_assignments" ON public.vendor_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
