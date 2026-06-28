## Goal
When an employee's supervisor changes, automatically reassign their historic 1-on-1 sessions to the new supervisor so the new manager has full context.

## Approach
Add a Postgres trigger on `employees` that fires when `manager_id` changes. It resolves the new supervisor's `user_id` and updates `one_on_ones.manager_user_id` for that employee's sessions, with an audit trail.

## Migration

1. **Trigger function `tg_transfer_one_on_ones_on_manager_change()`** (SECURITY DEFINER):
   - Fires on `UPDATE OF manager_id ON public.employees` when `NEW.manager_id IS DISTINCT FROM OLD.manager_id`.
   - Looks up `new_mgr_user := (SELECT user_id FROM employees WHERE id = NEW.manager_id)`.
   - If `new_mgr_user IS NOT NULL`:
     - `UPDATE one_on_ones SET manager_user_id = new_mgr_user, updated_at = now() WHERE employee_id = NEW.id AND manager_user_id IS DISTINCT FROM new_mgr_user`.
     - Insert an `audit_events` row per transferred session: `action='one_on_one_transferred'`, `entity='one_on_one'`, diff includes `from_manager`, `to_manager`, `employee_id`, reason `manager_change`.
   - If no new manager user exists (vacant supervisor), leave sessions as-is and log a single `audit_events` row noting the deferred transfer.

2. **One-time backfill** in the same migration: for every employee whose current supervisor's `user_id` differs from the `manager_user_id` of their existing `one_on_ones`, realign them. This cleans up historical data so the demo reflects the new behavior immediately.

## Scope guardrails
- Only `one_on_ones.manager_user_id` is rewritten. Notes (`one_on_one_notes`), agenda notes, and action items stay attached to the session and therefore transfer with it automatically.
- Manager-private notes authored by the previous supervisor remain visible to the new supervisor (they are scoped to the session, not the author). This matches the user's intent of "historic 1-on-1 meetings transfer." If you'd prefer private notes stay with the original author, say so and I'll scope the transfer to shared content only.
- No UI changes required; the existing `/one-on-ones` list filters by `manager_user_id` and will pick up transferred sessions automatically.

## Verification
- After approval, run a quick SQL check confirming a manager swap on a demo employee moves their historic sessions and writes audit rows.
