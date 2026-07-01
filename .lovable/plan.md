## Plan: make HR admin access reliable everywhere

### Goal
HR admins, especially the demo HR admin account, should be able to open the HR modules and see/manage all operational activity: PAFs, jobs/requisitions, applications, approvals, 1-on-1s, reviews, and related workflow data. This should not make anything public or weaken employee/candidate privacy.

### What I found
- The demo user does have `hr_admin`, `supervisor`, `hiring_manager`, and `employee` roles.
- The PAF and Jobs modules are currently enabled.
- Some database policies already allow HR admins, but several app screens still read directly through browser-side RLS or rely on role data fetched through policies. When that role/permission read is blocked, stale, or incomplete, the UI hides creation controls or returns empty lists.
- Several workflow pages still use direct table queries instead of the newer server-backed access pattern, which is why permissions can look correct in the admin panel but still fail in the actual module.

### Implementation steps
1. **Create a single server-backed HR access context**
   - Add/extend a server function that reads the current signed-in user’s roles and effective permissions with trusted server access.
   - Return normalized booleans like `isHrAdmin`, `canManagePaf`, `canManageJobs`, `canManageApprovals`, `canManageReviews`, `canManageOneOnOnes`.
   - Use this as the source of truth for navigation and page-level action buttons instead of fragile client-side role reads.

2. **Move PAF list and employee picker to server functions**
   - Replace direct browser queries on `/paf` with server functions:
     - HR admins see all PAFs.
     - HR admins can select any employee except themselves when creating a PAF.
     - Supervisors/department admins keep scoped access only.
   - Keep PAF submission authorization server-side so non-HR users cannot abuse the broader UI.

3. **Move Jobs/Requisitions list/detail reads to server functions**
   - Replace direct browser reads on `/jobs` and `/jobs/:id` for requisitions and approval chains.
   - HR admins see all requisitions and all applicants.
   - Hiring managers/supervisors keep scoped access based on requester/hiring manager/permissions.
   - Candidate/public careers behavior stays unchanged.

4. **Add HR-admin universal RLS safety net where needed**
   - Review the tables used by PAFs, jobs, approvals, one-on-ones, reviews, and screenings.
   - Add narrowly scoped authenticated HR-admin policies only where missing.
   - Do not add anon access and do not expose sensitive application or employee data publicly.

5. **Fix navigation/action gating**
   - Ensure the sidebar and page buttons treat HR admin as a universal internal administrator, even if granular permissions are not individually assigned.
   - Keep module toggles respected; if a super admin turns a module off, it stays off.

6. **Add a regression self-check/test path**
   - Expand the existing access self-check/regression tests so an HR admin must be able to:
     - list/create PAFs,
     - view approval chains/steps,
     - list all requisitions,
     - view applications,
     - list one-on-ones/reviews.
   - Keep negative checks for anon and ordinary employees so security does not regress.

### Validation
- Verify the demo HR admin role can access `/paf`, create a PAF, see existing PAFs, access `/jobs`, open a requisition, and see applicants/approval chains.
- Confirm public users still only see public posted careers data and cannot see internal requisition/application/admin workflow data.