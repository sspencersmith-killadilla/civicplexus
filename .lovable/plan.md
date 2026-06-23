## Goal

Let `hr_admin` users (acting as super admin) turn entire sidebar groups (modules) and individual nav items (features) on or off org-wide. Disabled items disappear from the sidebar AND their routes show a "Module disabled" screen.

## Database

New table `module_settings` keyed by a stable string key (one row per module or feature):

- `key` text PK (e.g. `module.hiring`, `feature.jobs`, `feature.offers`)
- `kind` text — `module` | `feature`
- `parent_key` text null (feature → its module key)
- `label` text (display name, mirrors sidebar label)
- `enabled` boolean default true
- `updated_at`, `updated_by`

Rules:
- GRANT select to `authenticated`; GRANT all to `service_role`.
- RLS: authenticated can `SELECT`; only `hr_admin` (via `private.has_role`) can `UPDATE`. No INSERT/DELETE from clients — rows are seeded from code.
- Default behavior: missing key = enabled (so new items work until an admin turns them off).

Seed migration: insert one row per existing NAV_GROUPS entry — one `module` per group, one `feature` per item, all `enabled=true`.

## Shared registry

`src/lib/modules.ts` — single source of truth derived from the existing `NAV_GROUPS` shape:
- `MODULE_REGISTRY`: list of `{ moduleKey, label, features: [{ key, label, to, roles }] }`.
- `app-shell.tsx` rebuilds `NAV_GROUPS` from this registry (no behavior change for users without the new table data).
- Each route file imports its own `featureKey` constant from this registry.

## Client hook

`useModuleSettings()` (TanStack Query):
- Fetches all rows from `module_settings` once, caches by key.
- Helpers: `isFeatureEnabled(featureKey)` returns `false` only if the feature row OR its parent module row is explicitly disabled.
- Invalidated on settings save.

## Sidebar filtering

In `app-shell.tsx`, after the existing role filter, also filter out:
- Groups whose `module` key is disabled.
- Items whose `feature` key (or parent module) is disabled.

## Route enforcement

Create `<ModuleGate featureKey="feature.jobs">{children}</ModuleGate>` component used inside each `_authenticated/*` route's component. When disabled, render a centered "This module has been turned off by your administrator" card with a link back to `/dashboard`. Lightweight — no router-level redirect needed (matches your "Hide nav + block route" choice).

Apply gate to every existing route file (mechanical edit; one import + wrapper per file).

## Admin UI

New route `src/routes/_authenticated/admin-modules.tsx` (sidebar entry under Admin group, hr_admin only):
- Groups by module. Each module shows a master switch + nested feature switches.
- Toggling a module disables/enables all child features visually but they remain independently togglable.
- "Save changes" button calls a `createServerFn` (`updateModuleSettings`) protected by `requireSupabaseAuth` + `has_role(_, 'hr_admin')`, upserts the changed rows, returns the new state.
- Toast confirmation; React Query cache invalidated so sidebar updates immediately.

## Out of scope

- New `super_admin` role (reusing `hr_admin` per your choice).
- Per-user/per-role module visibility (org-wide only).
- Backend enforcement beyond the UI/route gate (server fns still rely on existing RLS — toggles are presentation/access at the app layer, not data-level kill switches).

## Files touched

- New migration: `module_settings` table + seed.
- New: `src/lib/modules.ts`, `src/hooks/use-module-settings.ts`, `src/components/module-gate.tsx`, `src/lib/module-settings.functions.ts`, `src/routes/_authenticated/admin-modules.tsx`.
- Edit: `src/components/app-shell.tsx` (consume registry + filter), every `src/routes/_authenticated/*.tsx` page (wrap with `<ModuleGate>`).
