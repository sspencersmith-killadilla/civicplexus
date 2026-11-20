CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role <> 'candidate')
    OR EXISTS (SELECT 1 FROM public.employees WHERE user_id = _uid))
$$;
CREATE OR REPLACE FUNCTION public.is_known_user(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (public.is_staff(_uid)
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid)
    OR EXISTS (SELECT 1 FROM public.volunteers WHERE user_id = _uid))
$$;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid), public.is_known_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid), public.is_known_user(uuid) TO authenticated, service_role;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
   ('bargaining_units','Auth read units','s'),('cascades','cascade read all','s'),
   ('cba_contracts','Auth read contracts','s'),('cba_longevity_rules','Auth read longevity','s'),
   ('cba_step_tables','Auth read steps','s'),('certifications','auth read certs','s'),
   ('courses','auth read courses','s'),('doc_templates','Authenticated can read doc templates','s'),
   ('email_templates','Authenticated read email templates','s'),('equipment_catalog','auth read catalog','s'),
   ('form_definitions','form_defs_read_all_auth','s'),('leave_accrual_rules','Anyone signed in reads accrual rules','s'),
   ('leave_plans','Anyone signed in reads leave plans','s'),('module_settings','module_settings read all authenticated','k'),
   ('official_bodies','ob_auth_read','k'),('official_meetings','om_auth_read','s'),
   ('official_onboarding_templates','oobt_read','s'),('official_seats','os_auth_read','k'),
   ('official_template_tasks','ott_read','s'),('onboarding_templates','Templates: auth read','s'),
   ('pay_grades','all auth read pay grades','s'),('permission_group_keys','pgk read authenticated','s'),
   ('permission_groups','permission_groups read authenticated','s'),('permission_keys','permission_keys read authenticated','s'),
   ('position_budgets','Auth users read budgets','s'),('time_policies','time_policies read auth','s'),
   ('volunteer_shifts','Authenticated view all shifts','k')) AS t(tbl,pol,kind)
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', r.pol, r.tbl,
      CASE r.kind WHEN 's' THEN 'public.is_staff(auth.uid())' ELSE 'public.is_known_user(auth.uid())' END);
  END LOOP;
END $$;