## Module A — Compliance & Reporting

Compliance officers need provable evidence the org is following EEO, wage-hour, and policy obligations, plus a single place to pull reports.

### What's added

1. **EEO-1 / EEO-4 report** (`/reports/eeo`) — pulls headcount by EEO job category × race/ethnicity × gender × full/part-time using `employees`, `positions`, and existing `application_self_id` for current-workforce roll-up. Snapshot-as-of date picker. CSV export.
2. **FLSA classification audit** (`/reports/flsa`) — lists every position with `flsa_class`, exemption test answers, last-reviewed-by, and a "needs review" flag when annualized base pay falls below the salary threshold or the duties test is blank. HR can mark each row reviewed; entry stored in new `flsa_reviews` table.
3. **Policy acknowledgment campaigns** (`/policies` upgrade + new `/policies/$id/campaign`) — HR picks a published policy + audience (worker types / departments), launches a campaign that seeds rows in new `policy_campaigns` and `policy_campaign_assignments`. Cron sends weekly nudges to anyone still outstanding; manager dashboard shows their team's compliance %.
4. **Audit log viewer** (`/audit` upgrade) — filters by actor, entity, action, date range; jump-to-record link; CSV export. Today's `audit.tsx` is a stub.
5. **Compliance dashboard tile** on `/reports` — pending acknowledgments, expiring certifications (already in `employee_certifications`), training overdue, FLSA items needing review.

### Tables

- `flsa_reviews` (position_id, reviewed_by, reviewed_at, duties_test_notes, exempt_basis, decision, next_review_date)
- `policy_campaigns` (policy_id, name, audience_filter jsonb, due_date, status, created_by)
- `policy_campaign_assignments` (campaign_id, employee_id, acknowledgment_id, status, last_nudged_at)

All tables: GRANTs to authenticated + service_role; RLS — HR admin full access, employees read their own assignment rows.

### Server logic

- `compliance-reports.functions.ts` — EEO snapshot builder, FLSA audit list, CSV exporters.
- `policy-campaigns.functions.ts` — create campaign, refresh assignments when employees join/leave, mark complete on acknowledgment trigger.
- Trigger `tg_policy_ack_completes_assignment` — when a `policy_acknowledgments` row lands matching an open campaign assignment, mark it complete and emit `audit_events`.
- Cron extension in `reminders.ts` — daily sweep for overdue campaign assignments + weekly nudge.

---

## Module B — Compensation & Pay Bands

Give HR a structured way to define pay grades, compare against market, run a comp review cycle, and tie merit/bonus decisions to performance ratings.

### What's added

1. **Pay grades & bands** (`/comp/grades`) — define `pay_grades` (e.g. P1–P7) with min/mid/max for each band, currency, and FLSA default. Each `positions` row links to a grade (existing `pay_grade` text becomes FK).
2. **Employee compensation history** (`/employees/$id` → Comp tab, plus `/comp/employee/$id`) — `employee_comp` time-series rows: base salary, hourly rate, target bonus %, target equity, effective date, change reason. Compa-ratio computed against the linked grade midpoint and surfaced everywhere.
3. **Market ranges** (`/comp/market`) — `market_ranges` table with `job_family`, `level`, `geo`, percentiles (p25/p50/p75). HR uploads CSV; grade list shows market p50 next to band midpoint with variance %.
4. **Comp review cycles** (`/comp/cycles`, `/comp/cycles/$id`) — HR launches a cycle (period, budget %, eligibility filter). Trigger seeds `comp_review_participants` from current employees + their latest comp. Managers open the cycle and enter proposed merit %, promotion (new grade), and bonus payout for each direct report — capped to budget, with live compa-ratio + new-vs-current diff. Two-step approval (manager → skip-level → HR) reuses the existing `approval_chains` shape. Final approval writes a new `employee_comp` row dated to the cycle's effective date and posts a `personnel_actions` PAF for the audit trail.
5. **Performance linkage** — when seeding the cycle, each participant row gets the rating from the latest finalized `performance_reviews` row; manager grid shows it and a recommended merit %, but the manager can override with a justification.
6. **Manager + HR dashboards** — manager tile: "Comp review — N direct reports awaiting your input, $X of $Y budget used." HR tile: cycle progress, outliers (below band, compa-ratio < 0.8 or > 1.2), spend vs budget.

### Tables

- `pay_grades` (code unique, name, currency, min, mid, max, flsa_default, is_active)
- `employee_comp` (employee_id, effective_date, base_annual, hourly_rate, target_bonus_pct, target_equity, currency, change_reason, source [hire/merit/promotion/adjustment/cycle], cycle_id, created_by)
- `market_ranges` (job_family, level, geo, currency, p25, p50, p75, source, effective_date)
- `comp_cycles` (name, period_start, period_end, effective_date, budget_pct, status, eligibility_filter jsonb, created_by)
- `comp_review_participants` (cycle_id, employee_id, manager_id, current_comp_id, latest_review_id, recommended_merit_pct, proposed_merit_pct, proposed_promotion_grade_id, proposed_bonus_amount, manager_notes, approval_chain_id, status)
- Add FK `positions.pay_grade_id` → `pay_grades.id` (keep legacy `pay_grade` text as compat for one release).

All tables: GRANTs to authenticated + service_role; RLS — HR admin full, managers read participants where `manager_id = current employee id`, employees read their own `employee_comp` only.

### Server logic / triggers

- `comp.functions.ts` — grade CRUD, comp history read, current-comp fetch, market CSV import, compa-ratio helper.
- `comp-cycles.functions.ts` — `createCompCycle`, `submitManagerProposals`, `approveProposal`, `finalizeCycle` (writes `employee_comp` rows + PAFs).
- `tg_seed_comp_cycle` — on status → `open`, seed participants from eligible employees with latest comp + latest review.
- `tg_employee_comp_audit` — every insert emits an `audit_events` row.
- Cron in `reminders.ts` — nudge managers with outstanding proposals 7 / 3 / 1 days before cycle close.

### UI files

- `/comp/grades.tsx`, `/comp/market.tsx`, `/comp/cycles.index.tsx`, `/comp/cycles.$id.tsx`, `/comp/employee.$id.tsx`
- Existing `/employees/$id` gets a Comp tab and `/reports` gets a Comp section (pay equity by department/gender — uses self-ID data, HR-only).

### Out of scope

- Real-time payroll integration, stock grants/refresh modeling, geo-differential automation, multi-currency conversion (currency stored, not converted).

---

### Acceptance

- HR can launch an EEO snapshot, FLSA audit, and policy campaign from `/reports` and see correct counts vs underlying tables.
- A manager on `/comp/cycles/$id` enters proposals within budget, sends up, and after HR approves the affected employees show a new `employee_comp` row and PAF.
- Compa-ratio computed correctly: `base_annual / pay_grades.mid` for the linked grade.
- Finalized comp cycle is locked (no further edits without HR override).
