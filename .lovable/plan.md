
## Why the current editor isn't enough

The exempt schedule editor stores one row per day (`mon_start`/`mon_end` … `sun_start`/`sun_end`) on a fixed 7-day week. Public-safety shift work breaks that model in four ways:

- **Overnight shifts** — a 19:00–07:00 shift crosses midnight; a single start/end pair on one day can't represent it.
- **Multi-segment days** — split shifts and meal-break-paid coverage need two or more segments per day.
- **Multi-week rotations** — Kelly (9-day, fire), Pitman (14-day, patrol), DuPont (28-day), 4-on/4-off, 24/48, and 48/96 don't fit in a 7-day grid.
- **FLSA 207(k) work periods** — fire (up to 53 hrs / 7 days) and law-enforcement (up to 43 hrs / 7 days) use work periods of 7–28 days, not the standard 40-hour week, and OT is computed against that period.

## What we add

### 1. Shift catalog (`shift_types`)

Reusable named shifts with one or more segments and a color. Examples:
- "A-shift 24" — 07:00 → 07:00 next day (24h)
- "Patrol Day" — 06:00 → 18:00 (12h)
- "Detective 4/10" — 07:00 → 17:30 with 30-min unpaid meal
- "Split Bus" — 05:30–09:30 + 14:00–18:00

Each segment has `start`, `end`, `crosses_midnight`, `paid`, `unpaid_meal_min`.

### 2. Rotating pattern editor (`schedule_patterns`, `pattern_days`)

A pattern has a `cycle_length_days` (e.g. 9 for Kelly, 14 for Pitman, 28 for DuPont) and an ordered list of day slots. Each slot is either a `shift_type_id` or "Off." Pick from presets (24/48, 48/96, Kelly, Pitman 2-3-2, 4-on/4-off, DuPont, custom) or build from scratch. The editor shows a calendar preview of the next 8 weeks so the user can verify the rotation visually.

Assigning a pattern to an employee stores `anchor_date` (the first day of cycle position 1) so the system can compute "what shift am I on for date X."

### 3. 207(k) work-period support

Per-employee `work_period` config: `kind` (`standard_40` | `207k_fire` | `207k_law`), `period_days` (7–28), `period_anchor_date`, `ot_threshold_hours` (e.g. 53 for fire/7-day, 171 for fire/28-day, 43 for law/7-day, 86 for law/14-day). `compute_timesheet` keys off this instead of a fixed Mon–Sun week for these employees, and uses the 207(k) threshold rather than the 40h rule.

### 4. Schedule editor UI changes

Adds two new entry modes alongside today's "Mon–Fri hours":

- **Shift pattern** — pick a pattern + anchor date; preview rendered as a colored 4-week calendar.
- **Custom rotation builder** — table with N day slots (configurable cycle length); each slot is a dropdown of saved shift types, with "+ New shift" inline.

The existing "weekly hours" view stays the default for office staff so non-public-safety users see no extra complexity.

### 5. Where it surfaces

- Employee self-edit (exempt) keeps the weekly editor; gains a read-only "Assigned rotation" card when a pattern is attached by HR.
- HR admin gets full pattern/shift CRUD plus the ability to assign patterns and 207(k) periods to any employee.
- The clock-in card on `/timekeeping` shows today's expected shift (e.g. "A-shift 07:00–07:00, 24h").
- Timesheet rollups label hours by shift segment for payroll review.

## Technical notes

- New tables: `shift_types`, `shift_segments`, `schedule_patterns`, `pattern_days`, `employee_pattern_assignments`, `employee_work_periods`. All RLS-gated; HR admin writes, employee reads their own.
- Seed presets at install time: 24/48, 48/96, Kelly (9-day), Pitman 2-3-2 (14-day), 4-on/4-off, DuPont (28-day), plus common 8/10/12-hour day/swing/night shifts.
- `compute_timesheet` extended: if an `employee_work_periods` row exists, iterate the current period instead of Mon–Sun; if a `pattern_assignment` exists, derive `expected_hours` from the pattern rather than the weekly editor row.
- Pattern preview renders client-side from `pattern_days` so no extra round-trip.
- Comp-time math is unchanged: hours above the 207(k) threshold (or expected pattern hours for exempt) bank as comp time per the existing multipliers.

## Out of scope (flag for later)

- Auto-trading shifts between employees
- Mobile shift-bid / overtime call-out lists
- Holiday differential and shift-differential pay codes
- Minimum staffing rules and call-back rules
