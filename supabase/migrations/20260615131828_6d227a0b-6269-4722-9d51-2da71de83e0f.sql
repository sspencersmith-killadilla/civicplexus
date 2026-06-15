INSERT INTO public.user_roles (user_id, role)
SELECT p.id, r FROM public.profiles p
CROSS JOIN (VALUES ('hr_admin'::app_role), ('it_admin'::app_role), ('hiring_manager'::app_role)) AS t(r)
WHERE p.email = 'ssmith3@mckinneytexas.org'
ON CONFLICT DO NOTHING;