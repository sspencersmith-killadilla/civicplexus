CREATE TABLE public.module_settings (
  key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('module','feature')),
  parent_key text REFERENCES public.module_settings(key) ON DELETE CASCADE,
  label text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.module_settings TO authenticated;
GRANT ALL ON public.module_settings TO service_role;

ALTER TABLE public.module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_settings read all authenticated"
  ON public.module_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "module_settings hr_admin update"
  ON public.module_settings FOR UPDATE
  TO authenticated
  USING (private.has_role(auth.uid(), 'hr_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'hr_admin'::app_role));

CREATE TRIGGER tg_module_settings_updated_at
  BEFORE UPDATE ON public.module_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed modules + features mirroring NAV_GROUPS
INSERT INTO public.module_settings (key, kind, parent_key, label, enabled) VALUES
('module.overview','module',NULL,'Overview',true),
  ('feature./dashboard','feature','module.overview','Dashboard',true),
  ('feature./my-hr','feature','module.overview','My HR',true),
  ('feature./notifications','feature','module.overview','Notifications',true),
  ('feature./preboarding','feature','module.overview','My Onboarding',true),
  ('feature./help','feature','module.overview','Help & Docs',true),
('module.time-leave','module',NULL,'Time & Leave',true),
  ('feature./leave','feature','module.time-leave','Leave Requests',true),
  ('feature./paf','feature','module.time-leave','Personnel Actions',true),
('module.people','module',NULL,'People',true),
  ('feature./employees','feature','module.people','Employees',true),
  ('feature./positions','feature','module.people','Positions',true),
  ('feature./hire-requests','feature','module.people','Hire Requests',true),
  ('feature./offboarding','feature','module.people','Offboarding',true),
  ('feature./benefits','feature','module.people','Benefits',true),
  ('feature./equipment','feature','module.people','Equipment & PPE',true),
('module.workflow','module',NULL,'Workflow',true),
  ('feature./worker-types','feature','module.workflow','Worker Types',true),
  ('feature./templates','feature','module.workflow','Templates',true),
  ('feature./forms','feature','module.workflow','Forms Library',true),
  ('feature./provisioning','feature','module.workflow','IT Provisioning',true),
  ('feature./docs-generator','feature','module.workflow','Docs Generator',true),
  ('feature./doc-templates','feature','module.workflow','Doc Templates',true),
('module.coaching','module',NULL,'Coaching',true),
  ('feature./one-on-ones','feature','module.coaching','1-on-1s',true),
  ('feature./one-on-one-templates','feature','module.coaching','1-on-1 Templates',true),
  ('feature./goals','feature','module.coaching','Goals',true),
  ('feature./reviews','feature','module.coaching','Reviews',true),
  ('feature./review-cycles','feature','module.coaching','Review Cycles',true),
  ('feature./cascades','feature','module.coaching','Cascades',true),
('module.compliance','module',NULL,'Compliance',true),
  ('feature./training','feature','module.compliance','Training & Certs',true),
  ('feature./screenings','feature','module.compliance','Screenings',true),
  ('feature./policies','feature','module.compliance','Policies',true),
  ('feature./policy-campaigns','feature','module.compliance','Ack Campaigns',true),
  ('feature./grievances','feature','module.compliance','Grievances',true),
  ('feature./documents','feature','module.compliance','Documents',true),
  ('feature./reports','feature','module.compliance','Reports',true),
  ('feature./flsa-audit','feature','module.compliance','FLSA Audit',true),
  ('feature./eeo-snapshot','feature','module.compliance','EEO Snapshot',true),
  ('feature./audit','feature','module.compliance','Audit Log',true),
('module.texas-compliance','module',NULL,'Texas Compliance',true),
  ('feature./compliance/new-hire','feature','module.texas-compliance','New-Hire Reporting (TWC)',true),
  ('feature./compliance/tmrs','feature','module.texas-compliance','TMRS Monthly',true),
  ('feature./compliance/tcole','feature','module.texas-compliance','TCOLE Tracking',true),
('module.compensation','module',NULL,'Compensation',true),
  ('feature./comp-grades','feature','module.compensation','Pay Grades',true),
  ('feature./comp-market','feature','module.compensation','Market Ranges',true),
  ('feature./comp-cycles','feature','module.compensation','Comp Cycles',true),
  ('feature./payroll','feature','module.compensation','Payroll',true),
('module.hiring','module',NULL,'Hiring',true),
  ('feature./jobs','feature','module.hiring','Requisitions',true),
  ('feature./offers','feature','module.hiring','Offers',true),
  ('feature./email-templates','feature','module.hiring','Email Templates',true),
  ('feature./approvals','feature','module.hiring','Approvals',true),
  ('feature./internal-careers','feature','module.hiring','Internal Careers',true),
('module.admin','module',NULL,'Admin',true),
  ('feature./settings','feature','module.admin','Settings',true),
  ('feature./admin-migration','feature','module.admin','Data Migration',true),
  ('feature./admin-modules','feature','module.admin','Modules & Features',true);
