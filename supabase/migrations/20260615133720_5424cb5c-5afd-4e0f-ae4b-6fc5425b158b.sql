GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_types TO authenticated;
GRANT ALL ON public.worker_types TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_templates TO authenticated;
GRANT ALL ON public.onboarding_templates TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_tasks TO authenticated;
GRANT ALL ON public.template_tasks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_instances TO authenticated;
GRANT ALL ON public.onboarding_instances TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_instances TO authenticated;
GRANT ALL ON public.task_instances TO service_role;

GRANT SELECT ON public.policies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.policies TO authenticated;
GRANT ALL ON public.policies TO service_role;