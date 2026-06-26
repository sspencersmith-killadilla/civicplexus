
-- Restrict employee photo reads to owner or HR admin
DROP POLICY IF EXISTS "auth read employee photo assets" ON storage.objects;

CREATE POLICY "auth read employee photo assets"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    private.has_role(auth.uid(), 'hr_admin'::app_role)
    OR (
      (storage.foldername(name))[1] = 'logos'
    )
    OR (
      (storage.foldername(name))[1] = 'photos'
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id::text = (storage.foldername(name))[2]
          AND e.user_id = auth.uid()
      )
    )
  )
);

-- Ensure no permissive self-UPDATE policy exists on employees that lets
-- employees modify sensitive HR columns. Self-service contact updates go
-- through public.update_my_employee_contact (SECURITY DEFINER).
DROP POLICY IF EXISTS "Employees: update own" ON public.employees;
DROP POLICY IF EXISTS "Employees update own" ON public.employees;
DROP POLICY IF EXISTS "Employees: self update" ON public.employees;
