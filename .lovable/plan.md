
# Cross-Functional Teams

Self-organizing, cross-department teams (e.g. "AI Evaluation Team") with a full workspace: charter, members with roles, team goals + subgoals, deliverables, meetings/decisions, an updates feed, and links/files. Any employee can create a team. Visibility is private to members + HR admins.

## User-facing surfaces

New nav entry **Teams** (under `/_authenticated/teams`):
- `teams.index.tsx` — list of teams the signed-in user is a member of, plus (for HR admins) an "All teams" toggle. "New team" button.
- `teams.new.tsx` — create a team (name, purpose one-liner, sponsor employee, target end date). Creator becomes `lead`.
- `teams.$id.tsx` — team workspace with tabs:
  - **Charter** — mission, scope (in/out), success metrics, sponsor, start/end, status (`forming | active | paused | complete | archived`). Editable by leads.
  - **Members** — add/remove employees, assign role (`sponsor | lead | member`), optional allocation % and skills. Leads manage; members can leave.
  - **Goals** — team-level goals with subgoals (weighted rollup, same UX as current Goals). Each subgoal has an owner (team member) and optional due date.
  - **Deliverables** — title, description, owner, due date, status (`todo | in_progress | blocked | done | cancelled`), optional linked goal.
  - **Meetings & decisions** — meeting log (date, title, notes markdown, attendees) and standalone decisions (title, decided_at, decided_by, rationale).
  - **Updates** — chronological feed: comments + auto-events (member joined, deliverable done, goal progress, decision recorded).
  - **Files & links** — URL bookmarks + uploaded documents (reusing `documents` bucket pattern).
- Cross-links: an employee's profile lists teams they're on; each team goal shows on the owner's Goals page tagged "Team: X".

## Data model (new tables in `public`)

- `teams` — name, slug, purpose, mission, scope_in, scope_out, success_metrics (jsonb), sponsor_employee_id, status, start_date, target_end_date, created_by.
- `team_members` — team_id, employee_id, role enum(`sponsor|lead|member`), allocation_pct, skills text[], joined_at, left_at. Unique (team_id, employee_id) where left_at is null.
- `team_goals` — team_id, parent_goal_id (self-fk for subgoals), owner_member_id (nullable for team-level roots), title, description, target_date, weight, progress int, status enum(`draft|active|at_risk|completed|cancelled`), created_by. Rollup trigger analogous to existing `tg_goal_rollup`.
- `team_goal_updates` — goal_id, author_id, progress, status, note.
- `team_deliverables` — team_id, title, description, owner_member_id, linked_goal_id, due_date, status, completed_at.
- `team_meetings` — team_id, meeting_date, title, notes_md, attendee_member_ids uuid[], created_by.
- `team_decisions` — team_id, title, rationale, decided_at, decided_by, linked_meeting_id.
- `team_updates` — team_id, kind enum(`comment|member_joined|member_left|goal_progress|deliverable_status|decision|charter_change`), author_id, body_md, payload jsonb, created_at.
- `team_links` — team_id, label, url, added_by.
- `team_documents` — team_id, document_id (fk to existing `documents`).

All tables: GRANT to authenticated + service_role (no anon). RLS enabled.

## Access model

Security-definer helper `public.is_team_member(_team_id, _uid)` (checks active `team_members` row). `public.is_team_lead(_team_id, _uid)` (role in `sponsor|lead`).

Policies (typical):
- SELECT on every team_* table: `is_team_member(team_id, auth.uid()) OR has_role(auth.uid(),'hr_admin')`.
- INSERT `teams`: any authenticated user; trigger auto-inserts a `team_members` row for creator with role `lead`.
- INSERT/UPDATE on other tables: `is_team_member(...)`; UPDATE/DELETE of charter/members restricted to `is_team_lead(...)` or HR admin.
- `team_members` INSERT: leads only; self-DELETE (leave) allowed for own row.
- Auto-append `team_updates` rows via triggers on member changes, deliverable status, goal progress, decisions.

## Server functions

`src/lib/teams.functions.ts` (all `requireSupabaseAuth`):
- `createTeam({ name, purpose, sponsor_employee_id?, target_end_date? })` — inserts team + creator as lead in a single transaction (via `supabaseAdmin` after authz check).
- `addTeamMembers({ team_id, members:[{employee_id, role, allocation_pct?}] })` — lead only.
- `updateCharter({ team_id, patch })` — lead only; logs `charter_change` update.
- `cascadeTeamGoal({ parent_goal_id, children:[...] })` — mirrors existing `cascadeGoal`.
- `updateTeamGoalProgress({ goal_id, progress, status? })` — writes to `team_goal_updates` and lets rollup trigger update parent.
- `logMeeting`, `recordDecision`, `postUpdate`, `addLink`, `attachDocument`, `leaveTeam`.

Read paths use browser client + RLS for lists in each tab.

## UI implementation notes

- Reuse `AppShell`, shadcn `Tabs`, `Dialog`, `Card`, `Select`, `Textarea`.
- New shared `TeamGoalTree` component modeled on the recursive renderer in `goals.tsx`, but sourced from `team_goals` with per-team scoping.
- `useCurrentTeam(id)` hook returns team + caller's `team_members.role` for gating buttons.
- Add nav item to `app-shell.tsx` (Users icon, "Teams"), visible to all authenticated users.
- Empty states for each tab; skeletons via existing patterns.

## Out of scope for v1 (call out to user)

Formal RACI matrices per deliverable, Slack/Teams integrations, org-wide public browsing, budget tracking. These can layer on later without schema breaks.
