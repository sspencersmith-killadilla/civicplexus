## Goal

Fix the PAF visibility and creation problem, and add a new **Department Admin** role that can initiate PAFs for anyone in their assigned department(s) — alongside supervisors, hiring managers, and HR admins.

## Root causes

1. **Broken supervisor SELECT policy** — the current RLS on `personnel_actions` checks `employees.manager_id = auth.uid()`, but `manager_id` was migrated to reference `public.employees(id)`, not `auth.users(id)`. Supervisors can't see any PAF for their reports; HR admins can technically see them, but if they filed one on the demo/HR pool the initiator link may also mis-match.
2. **No department-scoped role** — today only direct-manager or HR-admin paths exist. There's no way for a department admin to originate a PAF for someone whose direct supervisor happens to be someone else in the department.
3. **UI shows "New PAF" to everyone** but the server rejects non-supervisors/HR — plus supervisors currently error out because the manager check compares `manager_id` (an employees.id) to `auth.uid()`.

## Changes

### 1. Database migration

- Add `department_admin` to the `app_role` enum.
- New table `public.department_admins (user_id uuid, department text, primary key (user_id, department))` with GRANTs, RLS (HR-admin manages; each user reads their own rows).
- Helper: `public.is_department_admin(_uid uuid, _dept text) returns boolean` (SECURITY DEFINER, stable).
- **Fix `personnel_actions` RLS**:
  - `SELECT`: HR admin **OR** initiator **OR** employee's own user **OR** the employee's manager (resolved through `employees.manager_id -> employees(user_id)`) **OR** a department admin for the employee's department **OR** a user with a pending/decided approval step on the PAF's chain.
  - `INSERT`: `initiated_by = auth.uid()` **AND** (`hr_admin` OR `supervisor` OR `hiring_manager` OR `department_admin`).
  - `UPDATE`: HR admin OR initiator (while draft/pending).
- Rewrite the read policies to use `SECURITY DEFINER` helpers where needed to avoid recursion.

### 2. Server function — `src/lib/paf.functions.ts`

- Add `department_admin` to the accepted roles for `submitPaf`.
- Non-HR authorization branch: allow if (a) direct manager of the target employee **or** (b) department admin whose departments include the target's `department`.
- Include department_admin as an accepted `approver_role` where relevant in the approval chain resolver.

### 3. UI — role plumbing

- Extend `AppRole` in `src/hooks/use-current-user.ts` to include `"department_admin"`.
- Update `src/lib/modules.ts` so PAF-adjacent routes (`/paf`, `/approvals`, `/employees`, `/positions`) include `department_admin`.
- Gate the "New PAF" button in `src/routes/_authenticated/paf.index.tsx` to `hr_admin | supervisor | hiring_manager | department_admin`.

### 4. Admin UI — manage the new role

- In `src/routes/_authenticated/admin-org-settings.tsx`, add a **Department Admins** panel where HR admins can:
  - Grant/revoke the `department_admin` role on a user.
  - Assign that user to one or more departments (multi-select of distinct department names from `employees`).
- Backing server functions in `src/lib/org-admin.functions.ts` (grant/revoke role, add/remove department assignment) — HR-admin gated.

### 5. Docs

- Add a short section to `docs/END_USER_GUIDE.md` under **PAF** and **Admin → Org Settings** describing the Department Admin role.

## Out of scope

- No changes to the PAF apply/decide logic or approval chain shapes (department_admin becomes an initiator; approvals still route supervisor → HR by default).
- No bulk backfill of existing PAF ownership.

## Verification

- HR admin can see the PAF list (existing PAFs render).
- Supervisor sees only PAFs for their direct reports.
- New department admin (with e.g. "Public Works" assigned) can create a PAF for any active Public Works employee and see all Public Works PAFs.
- Non-privileged employee still only sees their own.

Proceed?