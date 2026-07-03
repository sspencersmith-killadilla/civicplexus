## Goal
Give HR admins a self-serve reporting module: run ad-hoc read-only SQL across every module, save/share reports, and export results as CSV. Non-SQL users get a guided builder; power users get a full SQL editor with the live schema in view.

## Access & safety
- **Gate:** `hr_admin` role only (new permission key `reports.sql.run` also created so it can be granted à la carte via the existing permission groups system).
- **Read-only:** every query runs through a new `run_report_sql(_sql text, _limit int)` SECURITY DEFINER function that:
  - Rejects anything that isn't a single `SELECT` / `WITH ... SELECT` (parse check + regex denylist for `insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|vacuum|comment|;`).
  - Wraps the query in `SET LOCAL statement_timeout = '15s'; SET LOCAL transaction_read_only = on;` and executes inside a `BEGIN … ROLLBACK` block.
  - Forces `LIMIT` (default 1000, max 10000) and returns `jsonb` rows + column metadata.
  - Runs as a dedicated non-privileged role (`report_reader`) with `USAGE` on `public` and `SELECT` on public tables only — no access to `auth`, `storage`, `private`, `vault`, secrets, or `audit_events` raw PII columns (explicit `REVOKE`).
  - Logs every execution to a new `report_query_log` table (actor, sql, row count, ms, error).

## Schema browser
- New server fn `getReportSchema()` reads `information_schema` (tables + columns + FKs, `public` schema only, excluding tables in a denylist like `audit_events`, `interview_responses`, `signatures`, tokens tables).
- Rendered as a collapsible left panel: table → columns (type, nullable, FK arrow). Click a column to insert `table.column` into the editor.

## Report builder (no-SQL path)
Simple visual builder that compiles to SQL under the hood:
- Pick a primary table → pick columns (checkbox list) → add filters (column, operator, value) → add joins (suggested from FK metadata) → group by / aggregate (count, sum, avg, min, max) → order by → limit.
- "Show SQL" toggle reveals the generated query and drops the user into the SQL editor with it prefilled — one-way handoff (builder state isn't reconstructed from edited SQL).

## SQL editor
- Monaco editor with SQL syntax highlighting (already a light dep; use `@monaco-editor/react`).
- Run button → results table (virtualized), column headers show detected types, null rendered as muted `—`.
- Row count, execution time, and truncation warning ("Showing first 1000 of ≥ 1000 rows — add LIMIT or refine").
- Error panel shows Postgres error verbatim.

## Saved reports & sharing
- New table `saved_reports` (name, description, sql, builder_state jsonb nullable, is_shared bool, created_by, tags text[]).
  - RLS: owner can CRUD their own; `is_shared = true` reports readable by any `hr_admin`; only owner or hr_admin can edit/delete.
- List view: My reports / Shared with team / Recently run. Star to favorite (per-user `report_favorites` table).
- Duplicate, rename, delete, share toggle.

## Parameters
- Reports can declare `:param_name` placeholders. Before run, prompt for values with typed inputs (text/date/number/select-from-query). Values are bound server-side via parameterized execution — never string-concatenated.

## Export
- **CSV export** on the current result set (client-side, reuses `src/lib/download-csv.ts`).
- **Server-side CSV** for large results: new server fn `exportReportCsv({ report_id | sql, params })` streams up to 100k rows through the same read-only path and returns a signed download.
- Filename: `<report-name>_<YYYY-MM-DD>.csv`.

## Scheduling (light)
- Optional: per saved report, a `schedule_cron` + `email_to text[]`. A daily cron job (existing `/api/public/hooks/reminders.ts` pattern) picks due reports, runs them, and emails a CSV attachment via the existing email pipeline. Out of scope for v1 if it stretches — call it out but leave a stub.

## UI surface
- New route `src/routes/_authenticated/reports.tsx` with three tabs: **Browse** (saved), **Builder**, **SQL**.
- Nav entry under an "Admin" group, gated by `hr_admin`.
- Small "Open in Reports" button on module pages (e.g., Timesheets, Applications) that opens Reports pre-filtered to that table.

## Files to add/change

### New
- `supabase/migrations/<ts>_reports_module.sql` — `report_reader` role + grants/revokes, `run_report_sql()`, `saved_reports`, `report_favorites`, `report_query_log`, RLS + GRANTs, permission key insert.
- `src/lib/reports-sql.functions.ts` — `runReportSql`, `getReportSchema`, `listSavedReports`, `getSavedReport`, `saveReport`, `deleteReport`, `toggleFavorite`, `exportReportCsv`.
- `src/routes/_authenticated/reports.tsx` — page shell + tabs.
- `src/components/reports/schema-browser.tsx`
- `src/components/reports/report-builder.tsx`
- `src/components/reports/sql-editor.tsx` (Monaco wrapper, lazy-loaded)
- `src/components/reports/results-table.tsx`
- `src/components/reports/saved-reports-list.tsx`

### Changed
- `src/components/app-shell.tsx` — nav entry (gated).
- `package.json` — add `@monaco-editor/react` (lazy import so it doesn't bloat non-admin bundles).

## Not doing (v1)
- Charts/visualizations (CSV export is the ask).
- Cross-project / warehouse queries.
- Editing saved reports collaboratively in real-time.
- Full role-based row masking beyond the denylist (rely on `hr_admin` gate + column projection).

## Open questions
1. Should shared reports be visible to non-`hr_admin` users who've been granted `reports.sql.run` explicitly, or strictly hr_admin only?
2. Do you want the scheduled-email piece in v1, or defer?
3. Any tables that should be explicitly OFF-limits even to hr_admin reporting (e.g., `interview_responses` transcripts, `signatures`, `candidate_tokens`)? Default denylist proposed above — confirm or adjust.
