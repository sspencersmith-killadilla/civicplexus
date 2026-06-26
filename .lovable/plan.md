# Timekeeping Module

A new module that ties into the existing Leave system. Hourly staff clock in/out from the portal; the system computes overtime and (optionally) comp time. Exempt staff get a static weekly schedule (default 40h) and can log extra hours that bank as straight comp time.

## Classification

Add `flsa_class` to `worker_types` (`exempt` | `non_exempt`), defaulting existing types based on `is_peace_officer` / name (HR admin can edit). This is the single source of truth for which clocking flow an employee sees.

## New tables (all RLS-protected, GRANTed)

- `time_policies` — org-wide defaults: workweek start day, daily OT threshold (default 8), weekly OT threshold (default 40), OT multiplier (1.5), comp-time multiplier (1.5 for non-exempt, 1.0 for exempt), max comp-time bank, rounding rule (none / nearest 5/15 min), allow comp time in lieu of OT (bool), pay period source (`pay_calendars`).
- `employee_schedules` — per-employee weekly template: `mon_start, mon_end … sun_start, sun_end`, expected weekly hours (default 40 exempt), effective_from/to. HR can edit; employee can view.
- `time_entries` — `employee_id, clock_in, clock_out (nullable while open), source ('web'|'kiosk'|'manual'), notes, edited_by, approved_by, approved_at, pay_period_id`. One open entry per employee enforced by partial unique index.
- `time_breaks` — optional unpaid breaks tied to a `time_entry` (start/end).
- `timesheets` — weekly rollup per employee per pay period: `regular_hours, overtime_hours, comp_time_earned, holiday_hours, leave_hours, status ('open'|'submitted'|'approved'|'locked'), submitted_at, approved_by`.
- `comp_time_balances` — `employee_id, balance_hours, updated_at` (single row per employee, mirrors `leave_balances` pattern).
- `comp_time_ledger` — `employee_id, delta_hours, reason ('earned'|'used'|'cashed_out'|'adjustment'), source_entry_id, source_leave_request_id, created_by`.

Comp time as a leave type: insert a built-in `Comp Time` row into `leave_plans` so existing `leave_requests` flow handles using it. The leave-request approval trigger debits `comp_time_ledger` instead of (or in addition to) `leave_balances` based on plan type.

## Server functions (`src/lib/timekeeping.functions.ts`)

- `clockIn({ note? })` — refuses if open entry exists or employee inactive.
- `clockOut({ entryId, note? })` — closes entry, recomputes the day/week rollup.
- `startBreak` / `endBreak`.
- `getMyOpenEntry`, `getMyTimesheet({ periodId })`, `getMyCompBalance`.
- `submitTimesheet({ periodId })` — employee submits for supervisor approval.
- `approveTimesheet({ timesheetId, decision, notes })` — supervisor/HR; on approve, posts OT/comp-time deltas to `comp_time_ledger` + `comp_time_balances`.
- `editTimeEntry` (HR/supervisor with audit row in `audit_events`).
- `setEmployeeSchedule`, `setTimePolicy` (HR admin).

Calculation rules (run server-side on clock-out and on approve):
- **Non-exempt:** sum worked minutes per day; daily > daily OT threshold → OT. Weekly remainder > weekly threshold → OT. If `allow_comp_in_lieu` and employee opt-in, OT hours convert to comp time at 1.5×; else paid OT.
- **Exempt:** expected = schedule total (default 40). Worked − expected, if positive, banks as straight comp time at 1.0×. No OT.
- Apply rounding rule before calculation.

## UI

New `/timekeeping` route (gated by `ModuleGate('timekeeping')`):

- **Employee tab (default):** big Clock In/Out card showing live elapsed time, today's hours, week-to-date, comp-time balance, current schedule. Recent entries list with edit-request button. Submit-timesheet button at period end.
- **Supervisor tab** (visible to managers): pending timesheets for direct reports, approve/deny with notes, drill into daily entries.
- **HR admin tab:** time policies editor, per-employee schedule editor, all timesheets, manual entry/correction tool, comp-time ledger view, export CSV per pay period.

Add a small "Clock In" widget on `/my-hr` and `/dashboard`. Surface comp-time balance alongside leave balances on `/leave`.

## Leave integration

- New built-in `Comp Time` leave plan; requests against it deduct `comp_time_balances` via the existing approval flow (extend `tg_leave_request_approved` to branch on plan).
- Leave-request form shows comp-time balance when that plan is selected.
- Approved leave hours show on the timesheet as `leave_hours` (read-only) so the weekly totals reconcile.

## Module registry + docs

- Register `timekeeping` in `src/lib/modules.ts` so super-admins can toggle it from `/admin-modules`.
- Add a Timekeeping section to `docs/USER_GUIDE.md` and a tour step in `src/lib/demo-tour.ts`.
- Seed demo data: schedules for every demo employee, ~2 weeks of clock entries for a few hourly staff, one pending timesheet for a supervisor to approve, a positive comp-time balance on the demo HR user.

## Out of scope (call out for confirmation if you'd rather include)

- Geofencing / IP restrictions on clock-in
- Mobile kiosk / shared-device PIN mode
- Holiday-pay rules (federal/state holiday auto-credit) — currently treated as a manual leave plan
- Push to actual payroll export (we'll surface CSV; wiring into `payroll_exports` can be a follow-up)
