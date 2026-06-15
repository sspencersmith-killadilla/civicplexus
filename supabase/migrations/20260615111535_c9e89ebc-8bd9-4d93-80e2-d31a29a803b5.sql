
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Tasks: employee updates own" ON public.task_instances;
CREATE POLICY "Tasks: employee updates own" ON public.task_instances
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_instances oi
      JOIN public.employees e ON e.id = oi.employee_id
      WHERE oi.id = onboarding_instance_id AND e.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.onboarding_instances oi
      JOIN public.employees e ON e.id = oi.employee_id
      WHERE oi.id = onboarding_instance_id AND e.user_id = auth.uid()
    )
  );
