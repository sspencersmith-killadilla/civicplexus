
REVOKE EXECUTE ON FUNCTION public.tg_onboarding_progress() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_employees_autoassign_training() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_training_complete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_grievance_log_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_paf_log_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
