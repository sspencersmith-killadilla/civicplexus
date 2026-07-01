## Goal

Let HR admins connect the HRIS to an external LMS (Chamilo, Moodle, or Forma), automatically pull completion data into `employee_training`, and keep the existing manual CSV upload as a fallback / for any other system.

## Approach

All three LMSs expose REST APIs that return course completions per user. We add a small provider abstraction so each LMS has one adapter that returns a normalized "completion" shape (email, external_course_id, course_name, completed_at, score, evidence_url). Everything downstream — matching to employees/courses, upserting into `employee_training`, and issuing certifications — reuses the existing logic in `src/lib/lms.functions.ts`.

### 1. Schema (one migration)

- `lms_connections` — one row per configured LMS
  - `id`, `provider` (`chamilo|moodle|forma`), `label`, `base_url`, `auth_kind` (`api_key|oauth2|basic`), `enabled`, `sync_cursor` (timestamp of last successful pull), `last_sync_at`, `last_sync_status`, `last_error`, timestamps
  - Secrets (API key, client secret, password) are NOT stored in the row — stored via `secrets--add_secret` as `LMS_<PROVIDER>_<ID>_TOKEN`. Row only holds a reference name.
- `lms_sync_runs` — audit of each pull: connection_id, started_at, finished_at, rows_fetched, matched, unmatched, errors jsonb, status
- Extend `lms_credit_imports` with nullable `connection_id` so auto-syncs show in the same history UI as manual uploads
- RLS: HR admin only (SELECT/INSERT/UPDATE/DELETE); `service_role` full. Grants included.

### 2. Provider adapters

New file `src/lib/lms-providers.server.ts` exporting:

```
type LmsCompletion = { email; external_course_id; course_name; completed_at; score?; evidence_url? }
interface LmsProvider { testConnection(cfg): Promise<{ok, message}>; fetchCompletions(cfg, since?): AsyncIterable<LmsCompletion> }
```

Adapters:
- **Chamilo** — uses the built-in web service API (`main/webservices/api/v2.php`) with an API key. Endpoints: `user_list`, `course_list`, `user_get_completed_tracked_courses` (and `MySpace` reports). Pull completions since cursor, paginate.
- **Moodle** — Web Services REST (`/webservice/rest/server.php`), token auth. Functions: `core_completion_get_course_completion_status`, `gradereport_user_get_grade_items`, `core_enrol_get_enrolled_users`. Iterate courses × users, filter by `timecompleted > cursor`.
- **Forma LMS** — REST/JSON API with API key or basic auth. Endpoint: `/lms/api/v1/report/completion` (per Forma docs). Simple paginated pull.

Each adapter is self-contained, fetch-based (Workers-compatible), no SDK dependencies.

### 3. Server functions (`src/lib/lms-connections.functions.ts`)

All `requireSupabaseAuth` + HR-admin check:

- `listLmsConnections` / `upsertLmsConnection` / `deleteLmsConnection`
- `setLmsConnectionSecret({ id, secret })` — stores via `set_secret` under `LMS_<id>_TOKEN`
- `testLmsConnection({ id })` — loads adapter, calls `testConnection`, returns ok/message
- `runLmsSync({ id, dry_run? })` — pulls completions since cursor, reuses the existing matcher from `lms.functions.ts` (extract shared helper `matchAndStageCompletions`), writes a `lms_credit_imports` row (auto-commit or preview based on `dry_run`), records `lms_sync_runs`, advances `sync_cursor`

### 4. Scheduled auto-sync

Public route `src/routes/api/public/hooks/lms-sync.ts` (apikey-protected) iterates enabled connections and calls `runLmsSync`. Register a `pg_cron` job (hourly) that hits it via `pg_net` — following the schedule-jobs pattern already used for reminders.

### 5. UI

Extend `src/routes/_authenticated/lms-imports.tsx` with a two-tab layout:

- **Connections tab** (new)
  - List of `lms_connections` with status pill, last-sync time, "Test", "Sync now", "Edit", "Disable"
  - "Add connection" dialog: provider dropdown (Chamilo / Moodle / Forma), label, base URL, secret input (posted to `setLmsConnectionSecret`, never rendered back), enabled toggle
  - Recent `lms_sync_runs` table with row counts and error drill-down
- **Manual upload tab** (existing UI, unchanged) — CSV path continues to serve any LMS we don't have an adapter for. Provider dropdown gains `chamilo|moodle|forma|other`.

Nav entry stays under Training → "LMS imports"; page title becomes "LMS integrations".

### 6. Docs

Update `docs/END_USER_GUIDE.md` and `docs/SELF_HOSTING_GUIDE.md` with a short "Connecting an LMS" section covering the three providers (where to generate the API key/token in each, required endpoints/permissions, sync cadence, and how to fall back to CSV).

## Out of scope

- Pushing enrollments *from* HRIS *to* the LMS (read-only sync only)
- SCORM/xAPI ingestion
- Per-user OAuth (HR admin configures one service account per LMS)

## Open questions

1. Sync direction — read-only from LMS into HRIS is the assumption. Confirm you don't also want HRIS → LMS enrollment push in this pass.
2. Cadence — hourly cron OK, or do you want a manual-only "Sync now" button first and add the schedule later?
3. Any fourth LMS to include now (Absorb, TalentLMS, LearnDash)?
