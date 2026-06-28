
CREATE OR REPLACE FUNCTION public.tg_transfer_one_on_ones_on_manager_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_mgr_user uuid;
  _old_mgr_user uuid;
  _row record;
BEGIN
  IF NEW.manager_id IS NOT DISTINCT FROM OLD.manager_id THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO _new_mgr_user FROM public.employees WHERE id = NEW.manager_id;
  SELECT user_id INTO _old_mgr_user FROM public.employees WHERE id = OLD.manager_id;

  IF _new_mgr_user IS NULL THEN
    INSERT INTO public.audit_events(actor_id, action, entity, entity_id, diff)
    VALUES (auth.uid(), 'one_on_one_transfer_deferred', 'employee', NEW.id,
            jsonb_build_object('reason','new_supervisor_has_no_user_account',
                               'from_manager_id', OLD.manager_id,
                               'to_manager_id', NEW.manager_id));
    RETURN NEW;
  END IF;

  FOR _row IN
    SELECT id, manager_user_id FROM public.one_on_ones
     WHERE employee_id = NEW.id AND manager_user_id IS DISTINCT FROM _new_mgr_user
  LOOP
    UPDATE public.one_on_ones
       SET manager_user_id = _new_mgr_user, updated_at = now()
     WHERE id = _row.id;
    INSERT INTO public.audit_events(actor_id, action, entity, entity_id, diff)
    VALUES (auth.uid(), 'one_on_one_transferred', 'one_on_one', _row.id,
            jsonb_build_object('employee_id', NEW.id,
                               'from_manager_user_id', _row.manager_user_id,
                               'to_manager_user_id', _new_mgr_user,
                               'reason','manager_change'));
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_transfer_one_on_ones_on_manager_change ON public.employees;
CREATE TRIGGER trg_transfer_one_on_ones_on_manager_change
AFTER UPDATE OF manager_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.tg_transfer_one_on_ones_on_manager_change();

-- One-time backfill: realign existing sessions to current supervisor's user_id
UPDATE public.one_on_ones o
   SET manager_user_id = m.user_id, updated_at = now()
  FROM public.employees e
  JOIN public.employees m ON m.id = e.manager_id
 WHERE o.employee_id = e.id
   AND m.user_id IS NOT NULL
   AND o.manager_user_id IS DISTINCT FROM m.user_id;
