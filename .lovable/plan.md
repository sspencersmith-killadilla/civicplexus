## Goals

1. **Bulk CSV import** for employees and four related record types — upsert behavior keyed on `personal_email`.
2. **Supervisor-initiated hire requests** — a new `supervisor` role files a short request that auto-creates a draft employee + onboarding instance; HR reviews, edits, and activates.

---

## Part 1 — Bulk CSV import

New page: **Employees → Import (HR admin only)**, with a tab per record type. Each tab provides:

- A "Download template" button that exports a CSV with the correct headers and one example row.
- A drop zone that accepts a `.csv`, previews the first 5 rows in a table, validates headers, and shows row count.
- An **Import** button that runs the upsert and reports `{ inserted, updated, skipped, errors[] }`.

Record types and key columns:

| Tab | Match key | Required columns | Optional |
|---|---|---|---|
| Employees | `personal_email` | first_name, last_name, personal_email | work_email, phone, department, job_title, worker_type (name), start_date, status |
| Dependents | employee `personal_email` + dependent `first_name`+`last_name` | employee_email, first_name, last_name, relationship | dob, ssn_last4 |
| Certifications held | employee_email + certification name | employee_email, certification_name | issuer, issued_at, expires_at, notes |
| Training history | employee_email + course name | employee_email, course_name | status, due_date, completed_at, score |
| Equipment issued | employee_email + asset_tag | employee_email, item_name, asset_tag | serial_number, issued_on, condition |

**Upsert rules**
- Employees: match on `personal_email`; updates blank/changed fields, never overwrites with empty.
- Children (dependents, etc.): resolve `employee_id` from `employee_email`. Match on the composite key above. New rows insert; matches update non-empty fields. Worker types, certifications, and courses are resolved by name; unknown names go to the error list rather than creating new lookup rows.

**Error reporting**
- Per-row errors collected and shown in a results dialog with row number, column, and message. Successful rows still commit. A "Download errors as CSV" button is available.

### Where it lives
- Route: `src/routes/_authenticated/employees.import.tsx` (child of existing `employees` route — add `<Outlet />` to a renamed `employees.tsx` layout file, or use a tab on the existing page).
- Server function: `src/lib/employee-import.functions.ts` with one `createServerFn` per record type, all protected by `requireSupabaseAuth` and gated to `hr_admin` via `private.has_role` check inside the handler. Heavy lifting (lookup resolution, upsert) uses the admin client loaded inside the handler.
- Parsing: client-side with `papaparse` (small, no native deps). Server validates again before writing.

---

## Part 2 — Supervisor-initiated hire request

### New role
- Add `'supervisor'` to the `app_role` enum.
- Assignment UI: HR admins can grant the role from a new "Team" tab in user management (out of scope for this plan; for now, roles are seeded via the existing `user_roles` table — HR can add a row).

### New table: `hire_requests`
```text
id, requested_by (uuid → auth.users), employee_id (uuid → employees, nullable until draft created),
proposed_first_name, proposed_last_name, proposed_email, proposed_job_title, proposed_department,
worker_type_id, proposed_start_date, reason, notes,
status text default 'submitted'  -- submitted | drafted | active | rejected
hr_notes, decided_by, decided_at, created_at, updated_at
```

**RLS**
- INSERT: `supervisor` or `hr_admin`.
- SELECT: requester sees own; `hr_admin` sees all.
- UPDATE: `hr_admin` only.

### Submission flow
1. Supervisor opens **"Request new hire"** (new route `src/routes/_authenticated/hire-requests.tsx` with `new` dialog).
2. They fill: name, personal email, job title, department, worker type, proposed start date, reason.
3. On submit, a server function runs inside one transaction (RPC) and:
   - inserts the `hire_requests` row (status `submitted`),
   - inserts a draft `employees` row with `status = 'candidate'` and `created_by = requester`, `manager_id = requester` if requester is also the manager,
   - if the chosen worker type has a default `onboarding_template`, creates an `onboarding_instances` row and seeds `task_instances` from `template_tasks` (same logic that exists today in `employees.tsx`),
   - links the request to the new employee (`employee_id`), and sets request status to `drafted`,
   - emits a `notifications` row to all users with `hr_admin` role.
4. Supervisor sees confirmation; the request now sits in their "My requests" list.

### HR finalize flow
- Existing **Employees** page gets a top banner: "N hire requests awaiting review" linking to `/hire-requests`.
- `/hire-requests` lists pending requests with status filter. Clicking one opens a detail view showing the auto-drafted employee fields side-by-side with the request, editable, plus the seeded onboarding instance.
- HR can **Activate** (sets employee `status = 'preboarding'`, request `status = 'active'`, sends supervisor a notification) or **Reject** (sets request `status = 'rejected'` with `hr_notes`; deletes draft employee + onboarding instance in the same transaction).

### Navigation
- Add **Hire requests** to the sidebar for `hr_admin` and `supervisor` roles (existing `app-shell.tsx` already supports role-gated links).
- Keep the existing "New employee" dialog on the Employees page for HR (direct creation path, bypassing the request flow).

---

## Technical details

### Migration (single file)
- `ALTER TYPE app_role ADD VALUE 'supervisor';`
- `CREATE TABLE public.hire_requests (...)` with GRANTs (`authenticated`: SELECT/INSERT/UPDATE; `service_role`: ALL), RLS enabled, and the three policies above.
- `CREATE OR REPLACE FUNCTION public.create_hire_request(...)` — SECURITY DEFINER, returns the new request id; performs the multi-table insert atomically.
- `updated_at` trigger reusing `tg_set_updated_at`.

### Server functions
- `src/lib/hire-requests.functions.ts`
  - `submitHireRequest(input)` — `requireSupabaseAuth`, role check (`supervisor` or `hr_admin`), calls the RPC.
  - `decideHireRequest({ id, action: 'activate' | 'reject', hr_notes? })` — `hr_admin` only.
- `src/lib/employee-import.functions.ts` — one fn per record type; each validates headers with zod, resolves lookups, and performs the upsert via `supabaseAdmin` loaded inside the handler.

### Dependencies
- `papaparse` for CSV parsing in the browser and inside server functions.
- No other new packages.

### Files added/changed
```text
supabase/migrations/<ts>_hire_requests_and_supervisor_role.sql
src/lib/hire-requests.functions.ts
src/lib/employee-import.functions.ts
src/routes/_authenticated/hire-requests.tsx
src/routes/_authenticated/employees.import.tsx
src/components/app-shell.tsx        (add nav items)
src/routes/_authenticated/employees.tsx  (add "Import" + "Pending requests" banner)
```

### Out of scope
- Editing the new `supervisor` role membership via UI (HR seeds via SQL or the existing user-roles table).
- Email notifications to supervisors/HR (in-app notifications only; existing `notifications` table is reused).
- Bulk import of `documents`, `screenings`, `policy_acknowledgments`, `provisioning_requests`.
