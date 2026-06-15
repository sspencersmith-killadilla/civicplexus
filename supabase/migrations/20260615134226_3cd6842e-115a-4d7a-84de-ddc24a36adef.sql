REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.employees FROM anon;
REVOKE ALL ON public.worker_types FROM anon;
REVOKE ALL ON public.onboarding_templates FROM anon;
REVOKE ALL ON public.template_tasks FROM anon;
REVOKE ALL ON public.onboarding_instances FROM anon;
REVOKE ALL ON public.task_instances FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.policies FROM anon;
GRANT SELECT ON public.policies TO anon;