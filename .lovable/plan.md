
## 1. Custom permission groups (HR-managed, granular)

### Data model (new migration)
- `permission_keys` (seed table): `key text primary key`, `label`, `category`, `description`. Seeded with a catalog like `employees.read`, `employees.write.contact`, `employees.write.compensation`, `interview_kits.read`, `interview_kits.write`, `job_requisitions.read.internal`, `job_requisitions.write`, `job_requisitions.approve`, `paf.initiate`, `paf.approve`, `reviews.finalize`, `timekeeping.approve`, `comp.write`, `payroll.run`, `org_settings.write`, etc.
- `permission_groups`: `id`, `name` (unique), `description`, `is_system boolean`, `created_by`.
- `permission_group_keys`: `group_id`, `permission_key` (composite PK).
- `user_permission_groups`: `user_id`, `group_id` (composite PK), `granted_by`, `granted_at`.
- `user_permission_grants` (optional per-user override): `user_id`, `permission_key`, `mode` (`grant`|`deny`), `granted_by`. Deny wins for tightening; explicit grant adds to whatever groups provide.
- All four tables: GRANTs to `authenticated` (SELECT) and `service_role` (ALL); HR-only INSERT/UPDATE/DELETE via `has_role(_,'hr_admin')`.

### Security-definer helper
- `private.has_permission(_uid uuid, _key text) returns boolean` — HR admins always true; otherwise: `(exists in user_permission_groups→permission_group_keys with key) AND NOT exists deny override) OR grant override`. `STABLE SECURITY DEFINER`, search_path locked.
- Wrapper `public.has_permission(_key text)` reads `auth.uid()` for use in RLS.

### RLS integration (targeted, additive)
Extend existing policies on `employees`, `interview_kits`, `job_requisitions` (and a few adjacent tables: `personnel_actions`, `performance_reviews`, `payroll_runs`) so that in addition to role-based access, `public.has_permission('<key>')` also grants the operation. Existing HR/manager/self policies stay intact — permissions can only broaden or (via deny override) narrow through server checks; they cannot bypass department/self scoping unless explicitly granted at the write level.

### Server-function enforcement
- New `src/lib/permissions.functions.ts`: `listPermissionKeys`, `listGroups`, `getGroup`, `upsertGroup`, `deleteGroup`, `setGroupKeys`, `listUserGroups`, `assignUserToGroup`, `removeUserFromGroup`, `setUserOverride`, `getEffectivePermissions(userId)`.
- New `src/lib/authz.server.ts`: `assertPermission(ctx, key)` used by high-value server fns (PAF submit/approve, comp writes, requisition post, kit upsert, payroll run) alongside existing role checks.

### Client
- New `useMyPermissions()` hook fetching effective keys once; `<Can perm="…">` gate for menu items and buttons.
- Extend `/admin-org-settings` with a **Permissions** tab:
  - Groups list + editor (name, description, key picker grouped by category).
  - User assignment picker (search employees → assign/remove groups, add per-user grant/deny).
  - Read-only "Effective permissions" preview for the selected user.

## 2. Role-matrix RLS regression tests

New `tests/roles-matrix.test.ts` (Vitest), authenticated via env credentials with graceful skip when creds are absent. Adds required env: `E2E_HR_*`, `E2E_DEPT_*` (department admin scoped to a known dept, e.g. "Library"), `E2E_SUP_*`, `E2E_EMP_*`.

For each of `employees`, `interview_kits`, `job_requisitions`, run a matrix of `(role × op)` where op ∈ {SELECT own, SELECT peer, SELECT out-of-scope, INSERT, UPDATE own, UPDATE peer, DELETE}. Expected outcomes:

```text
                       employees              interview_kits         job_requisitions
HR admin      R/W all rows                    R/W all                R/W all incl internal cols
Dept admin    R all; W within own dept only   R only                 R all; W within dept
Supervisor    R self+reports; W self contact  R only                 R all posted+internal; no W
Employee      R self+directory-safe cols;     no read                R posted only; no internal
              W self contact only                                    cols; no W
```

Each cell is one `it()` asserting either the expected row/columns come back or the write errors with an RLS/permission message. Column-leak checks reuse the `select("id, forbidden_col")` pattern already in `tests/rls-authz.test.ts`.

Additional cross-cutting cells:
- Employee with `employees.write.compensation` permission granted → UPDATE of `base_annual` via `employee_comp` server fn succeeds (proves permission plumbing).
- Employee with a deny override on `job_requisitions.read.internal` → still cannot see internal cols even if their role would allow (proves deny wins).

## 3. Files touched

**Migrations:** 1 new (permission tables + grants + RLS + `has_permission` helpers + additive policy clauses on employees/interview_kits/job_requisitions/personnel_actions/performance_reviews/payroll_runs).

**New code:**
- `src/lib/permissions.functions.ts`
- `src/lib/authz.server.ts`
- `src/hooks/use-permissions.ts`
- `src/components/can.tsx`
- `src/routes/_authenticated/admin-permissions.tsx` (or a tab inside `admin-org-settings.tsx`)
- `tests/roles-matrix.test.ts`

**Edits:**
- `src/routes/_authenticated/admin-org-settings.tsx` — add Permissions tab entry.
- `src/components/app-shell.tsx` — wrap sensitive nav items in `<Can>`.
- Selected server fns (`paf.functions.ts`, `comp.functions.ts`, `jobs.functions.ts`, `interview-kits.functions.ts`, `payroll.functions.ts`) — add `assertPermission` alongside current role checks.
- `docs/END_USER_GUIDE.md` + `docs/USER_GUIDE.md` — HR "Permissions" section.

## 4. Non-goals

- Not rewriting existing role checks — permissions layer is additive.
- Not touching auth/provider/session code.
- No breaking changes to current RLS policies; new clauses are `OR public.has_permission(...)` additions.

## Technical notes

- `has_permission` is `STABLE SECURITY DEFINER` with fixed `search_path` to avoid recursion and search-path attacks.
- `is_system` groups (e.g. "HR Admin", "Supervisor default") are shipped seeded and cannot be deleted from the UI.
- Deny overrides are enforced in `has_permission` itself so both RLS and server fns honor them uniformly.
- Test suite skips cleanly when env creds are missing so CI stays green without seeded demo users.
