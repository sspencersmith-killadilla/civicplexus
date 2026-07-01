
-- 1. Add department_admin role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'department_admin';
