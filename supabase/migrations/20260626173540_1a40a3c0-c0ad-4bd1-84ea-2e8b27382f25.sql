-- Repoint manager_id from auth.users(id) to employees(id)
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_manager_id_fkey;

-- Convert existing manager_id values (which currently store auth user_ids) to employee ids
UPDATE public.employees e
   SET manager_id = m.id
  FROM public.employees m
 WHERE e.manager_id IS NOT NULL
   AND m.user_id = e.manager_id;

-- Null out anything that didn't resolve to an employee row
UPDATE public.employees
   SET manager_id = NULL
 WHERE manager_id IS NOT NULL
   AND manager_id NOT IN (SELECT id FROM public.employees);

ALTER TABLE public.employees
  ADD CONSTRAINT employees_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES public.employees(id) ON DELETE SET NULL;