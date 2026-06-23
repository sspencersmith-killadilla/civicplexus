
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_paf_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_grievance_case_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_fmla_case_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_hire_request(text,text,text,text,text,uuid,date,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_hire_request(text,text,text,text,text,uuid,date,text,text,text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_hire_request(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_paf_step(uuid,text,text) FROM PUBLIC, anon;
