
REVOKE EXECUTE ON FUNCTION public.clock_in(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clock_out(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.compute_timesheet(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_timesheet(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clock_in(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clock_out(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_timesheet(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_timesheet(uuid, text, text) TO authenticated;
