# My HR: photo, supervisor, and direct reports

Enhance `src/routes/_authenticated/my-hr.tsx` so the signed-in employee sees their own photo, their supervisor, and their direct reports — each linking to the corresponding employee profile, with a small "tasks due" indicator on each direct report.

## What the user will see

A new "My team" card near the top of My HR:

- **Header**: their own avatar (photo or initials), name, title, department.
- **Reports to**: a single row with the supervisor's avatar, name, and title. Clicking opens `/employees/{id}`. If no supervisor, shows "No supervisor on file."
- **Direct reports**: a grid of compact cards (avatar, name, title). Each card shows a badge like "3 tasks due" when that report has open onboarding/training/leave items, and links to `/employees/{id}`.
- Empty state when there are no direct reports: "No direct reports."

Photos use the existing signed-URL flow (`getEmployeePhotoUrl` from `src/lib/employee-photos.functions.ts`); initials fallback when no photo.

## Technical details

1. **Data fetch** (in `my-hr.tsx`):
   - Current employee row already loaded — extend select to include `photo_path` and `manager_id`.
   - Supervisor: `employees.select(id, first_name, last_name, job_title, photo_path).eq('id', me.manager_id)`.
   - Direct reports: `employees.select(id, first_name, last_name, job_title, photo_path).eq('manager_id', me.id).eq('status','active').order('last_name')`.
   - Photos: batch-resolve signed URLs via `getEmployeePhotoUrl` per employee with a small React Query keyed per `photo_path` (reuse pattern from `employees.$id.tsx`).
   - "Tasks due" count per direct report: a new lightweight server function `getDirectReportTaskCounts` in a new file `src/lib/my-team.functions.ts` (uses `requireSupabaseAuth`, verifies caller is each report's manager via `employees.manager_id`, returns `{ employee_id, open_tasks, overdue_training, pending_leave }`). Counts come from `task_instances` joined through `onboarding_instances` where `status <> 'complete'`, plus `employee_training` where `status in ('assigned','in_progress')` and `due_date <= now()+7d`, plus `leave_requests` where `status='pending'`.

2. **UI components** — local in `my-hr.tsx`:
   - `PersonChip`: avatar + name + title, wrapped in `<Link to="/employees/$id">`.
   - `DirectReportCard`: `PersonChip` plus a small badge summarizing open items ("3 to review"), tooltip lists the breakdown.

3. **Access**: all data already scoped to the user; the new server function authorizes by verifying `manager_id` chain. No RLS changes.

4. **No schema changes**, no new tables, no new routes.

## Out of scope

- Editing the employee's own photo (still HR-only on the profile page).
- Skip-level / full org tree (already available at `/org-chart`).
- Reordering or restructuring other My HR cards.