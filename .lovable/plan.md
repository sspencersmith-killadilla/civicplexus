## Root cause

The granular permission system only affects three tables (`employees`, `interview_kits`, `job_requisitions`). Everything else — `one_on_ones`, `job_applications`, `interviews`, `screenings`, `application_messages`, and the 1-on-1 child tables — still gates access purely on role (`hr_admin`) or a hardcoded manager/hiring-manager relationship. So granting permissions in `/admin-permissions` has no effect on those flows.

Two concrete failures follow from that:

1. **"Can't schedule a 1-on-1 with a direct report"** — the New 1-on-1 dialog's employee picker queries `employees` directly from the browser. RLS returns only rows where `manager_id = <my employee id>` (plus own row). If a supervisor's direct reports aren't perfectly linked (or they're a department admin, not the direct manager), the dropdown is empty and there's no one to pick. Even after fixing links, department admins and delegates have no path.
2. **"Can't see candidates for jobs"** — `job_applications` SELECT requires `hr_admin` OR `hiring_manager_id/requested_by = auth.uid()`. A department admin, a supervisor with view rights, or anyone granted a "read applications" permission is filtered out. Same story for `interviews`, `interview_feedback`, `screenings`, `application_messages`.

## Fix

### 1. Extend the permission catalog

Add keys the RLS layer can honor:
- `one_on_ones.manage` — schedule/edit any 1-on-1 (and read/write child notes, agenda, action items)
- `one_on_ones.read.reports` — read 1-on-1s for anyone in the caller's reporting chain (dept admin / skip-level)
- `applications.read` — read job applications and application messages across postings
- `applications.write` — update status / add messages
- `interviews.manage` — read/write interviews, feedback
- `screenings.read` — read AI screening rows

Seed a **"Hiring team"** system group (`applications.read` + `applications.write` + `interviews.manage` + `screenings.read` + `interview_kits.read` + `job_requisitions.read.internal`) and a **"People manager+"** group (`one_on_ones.manage` + `one_on_ones.read.reports`). HR admin retains implicit-all.

### 2. Add permission-aware RLS clauses

Additive `PERMISSIVE` policies (existing role/relationship policies stay in place):
- `one_on_ones`: SELECT/INSERT/UPDATE/DELETE where `has_permission('one_on_ones.manage')`; SELECT where `has_permission('one_on_ones.read.reports')` AND the target employee reports (directly or transitively) into the caller.
- `one_on_one_notes`, `one_on_one_agenda_notes`, `one_on_one_action_items`: mirror the parent's `has_permission('one_on_ones.manage')` for full access.
- `job_applications`, `application_messages`: SELECT via `applications.read`, INSERT/UPDATE via `applications.write`.
- `interviews`, `interview_feedback`: ALL via `interviews.manage`.
- `screenings`: SELECT via `screenings.read`.

Add a small SECURITY DEFINER helper `private.reports_into(_manager_uid uuid, _employee_id uuid)` for the transitive-report check so the RLS doesn't recurse on `employees`.

### 3. Unblock the 1-on-1 employee picker

The dropdown must show anyone the caller can legitimately meet with, not what browser-RLS happens to return. Add `listOneOnOneCandidates` server function (in `src/lib/one-on-one-transfer.functions.ts` or a new `src/lib/one-on-ones.functions.ts`) using `supabaseAdmin` that returns:
- HR admin or `one_on_ones.manage` → all employees
- Otherwise → self + direct reports + transitive reports (if `one_on_ones.read.reports`) + department-admin scope

Swap `one-on-ones.index.tsx`'s `employeesQ` to use this function via `useServerFn`.

### 4. Unblock the candidate view for job_applications

Add `listApplicationsForRequisition` / `listApplicationsInbox` server functions that check role + `applications.read` + hiring-manager relationship server-side and return rows via `supabaseAdmin`. Update `src/routes/_authenticated/jobs.$id.tsx` (and the applicant-pool view used for AI screening bulk actions) to use them, mirroring the pattern already used for the directory/org chart.

### 5. Regression coverage

Extend `tests/roles-matrix.test.ts` with matrix rows for `one_on_ones`, `job_applications`, `interviews`, and `screenings` under the four roles + a "granted `applications.read`" user, so the permission→RLS wiring can't silently regress again.

## Out of scope

- No redesign of the admin permission UI — the new keys will appear automatically in the existing category list.
- No changes to the existing role-based policies; the new clauses are strictly additive so nothing currently working breaks.

## Files touched

- New migration: permission keys + system groups + additive RLS + `private.reports_into` helper
- `src/lib/one-on-ones.functions.ts` (new) — `listOneOnOneCandidates`
- `src/lib/applications.functions.ts` (new) — `listApplicationsForRequisition`, `listApplicationsInbox`
- `src/routes/_authenticated/one-on-ones.index.tsx` — swap picker to server fn
- `src/routes/_authenticated/jobs.$id.tsx` and applicant-pool component — swap applicant reads to server fn
- `tests/roles-matrix.test.ts` — expanded matrix
