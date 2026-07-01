## Goal

Restore visibility and action on 1-on-1s and performance reviews for every role (employee, supervisor, HR admin) without loosening security, and add a repeatable end-to-end RLS test we can rerun any time.

## What I found

Reading the live policies on `one_on_ones`, `one_on_one_notes`, `one_on_one_agenda_notes`, `one_on_one_action_items`, `performance_reviews`, `review_cycles`, and `review_cycle_participants`, three concrete gaps explain the symptoms:

1. **1-on-1s use `manager_user_id = auth.uid()` in RLS, but supervisors are also stored as employee-id refs elsewhere.** When a supervisor was reassigned, older sessions still carry a stale `manager_user_id`, so the supervisor sees nothing and HR-only server functions became the only way in. There is no fallback for "current supervisor via employees.manager_id chain".
2. **`performance_reviews` "Manager manage own reviews"** requires `employees.manager_id` (an employee id) to be in the set of employee-ids owned by `auth.uid()`. That is correct after the manager_id migration, but the companion **`review_cycle_participants` policy** for managers still joins on the old shape and produces zero rows for most managers, so the review inbox is empty even though the underlying review is readable.
3. **`one_on_one_notes` INSERT `WITH CHECK`** requires `can_access_one_on_one(session_id)` — the helper only returns true for `manager_user_id`/employee `user_id`. Employees whose `user_id` link was rebuilt after the demo reset lose access until they refresh, which is why "assign eval / add note" silently fails.

None of these are security regressions — the intent is right — but the joins are stale.

## Plan

### 1. One migration that fixes the three policy gaps

- Replace `one_on_ones` SELECT/UPDATE/DELETE policies so they also match when the viewer is the **current** supervisor (via `employees.manager_id → employees.user_id`), the employee themselves, or HR. Keep INSERT restricted to manager/HR via `WITH CHECK`.
- Rewrite `private.can_access_one_on_one` and `private.is_one_on_one_manager` to use the same current-supervisor lookup so notes/agenda/action items inherit the fix automatically.
- Rewrite `review_cycle_participants` "Managers see their reports' participation" to use the same employee→manager join used by `performance_reviews` "Manager manage own reviews".
- Add an explicit `Employee read own participation` policy on `review_cycle_participants` so an employee can see their own row in a cycle.
- Leave HR-admin `ALL` policies untouched.

### 2. A "role can do X" self-test we can rerun

Add `tests/roles-e2e.test.ts` (Vitest) that:

- Signs in as three seeded fixtures — HR admin, supervisor, employee — using their known demo credentials.
- Asserts each can perform the workflows we broke: list their 1-on-1s, add a shared note, open the review inbox, and (HR only) create a review cycle participant.
- Asserts each is blocked from the things they should not do (employee cannot read a peer's private note, supervisor cannot read another team's 1-on-1, etc.).

This complements the existing `tests/rls-authz.test.ts` (which only exercises the anonymous role) with the authenticated-role coverage we are missing.

### 3. In-app "Access self-check" panel

Add a small `/admin-org-settings` → "Access self-check" section (HR only) that runs the same probes at runtime against the *current* signed-in user's row shapes and reports pass/fail. This is what you will click after each migration to confirm "everyone can do their job".

## Files to change

- New migration (policies + helper functions above)
- `tests/roles-e2e.test.ts` (new)
- `src/routes/_authenticated/admin-org-settings.tsx` (add self-check panel)
- `src/lib/access-selfcheck.functions.ts` (new server fn backing the panel)

No UI or business-logic changes beyond the self-check panel.
