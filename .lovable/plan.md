## 1. Forms library preview only changes URL

`src/routes/_authenticated/forms.tsx` and `forms.$key.tsx` are siblings by filename, but TanStack Router treats `forms.tsx` as a **layout** for `forms.$key.tsx` (the route tree shows `AuthenticatedFormsRouteWithChildren`). The layout renders `FormsLibrary` instead of `<Outlet />`, so clicking Preview navigates to `/forms/$key` but nothing mounts — the URL changes, the grid stays.

**Fix:** rename `src/routes/_authenticated/forms.tsx` → `src/routes/_authenticated/forms.index.tsx`. They become true siblings (both leaves), `/forms` keeps rendering the library, `/forms/$key` renders the detail page with the signature runner.

No code changes — pure file move. `routeTree.gen.ts` regenerates automatically.

## 2. IT provisioning baked into "New employee"

Today HR has to go to a separate IT Provisioning page and add each request one-by-one. Goal: pick the items once in the New Employee dialog, rows land on the IT board automatically.

### UI changes (`src/routes/_authenticated/employees.tsx`)

Add an **"IT provisioning"** section to the New Employee dialog, below the onboarding-template selector:

```text
IT provisioning to kick off
[x] Email account
[x] AD / SSO account
[x] VPN access
[ ] Phone / extension
[ ] Access badge
[ ] Equipment (laptop/radio)
[Notes for IT  ____________________]   (single optional textarea, applied to all rows)
```

- Pull the kind list from a new shared module `src/lib/provisioning-kinds.ts` so the New Employee dialog and the Provisioning page render the exact same labels/icons (no drift).
- Default-checked: `email`, `ad_account`, `vpn`. Others unchecked.
- A `Select all` / `Clear` link above the list.

### Defaults driven by worker type (low-touch automation)

Add a nullable `jsonb` column `worker_types.default_provisioning` (array of kind keys). When the user picks a worker type in the dialog, prefill the checkboxes from that list if present, otherwise fall back to the global defaults above.

A small "Edit defaults" affordance on `src/routes/_authenticated/worker-types.tsx` (chip list with toggles) lets admins set this per worker type once, so future hires of that type auto-populate IT correctly. Out of scope: editing `default_provisioning` from anywhere else.

### Create mutation

After the existing employee insert + onboarding instantiation, in the same `useMutation`:

```ts
const checked = KINDS.filter(k => selected[k.key]);
if (checked.length) {
  await supabase.from("provisioning_requests").insert(
    checked.map(k => ({ employee_id: emp.id, kind: k.key, notes: itNotes || null, status: "pending" }))
  );
}
```

RLS already allows `hr_admin` to write `provisioning_requests`, and the IT board reads `status='pending'` first, so the new rows show up on `/provisioning` immediately. Invalidate `["provisioning"]` on success so the board refreshes if it's open in another tab.

### Hire requests flow

`public.create_hire_request` (the supervisor-initiated draft path) gets the same treatment via a new optional `_provisioning_kinds text[]` parameter — when HR activates the request, the rows already exist so IT can start working without a second handoff. The supervisor form (`hire-requests.tsx`) gets the same checkbox group.

## 3. Migration

```sql
ALTER TABLE public.worker_types
  ADD COLUMN IF NOT EXISTS default_provisioning jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.create_hire_request(
  _first_name text, _last_name text, _email text, _job_title text, _department text,
  _worker_type_id uuid, _start_date date, _reason text, _notes text,
  _provisioning_kinds text[] DEFAULT NULL
) RETURNS uuid ... -- existing body + INSERT into provisioning_requests for each kind
```

## Files touched

- `src/routes/_authenticated/forms.tsx` → renamed to `forms.index.tsx` (no content change)
- `src/lib/provisioning-kinds.ts` (new — shared KINDS array + icons)
- `src/routes/_authenticated/provisioning.tsx` (import shared KINDS)
- `src/routes/_authenticated/employees.tsx` (checkbox group + insert)
- `src/routes/_authenticated/worker-types.tsx` (edit `default_provisioning`)
- `src/routes/_authenticated/hire-requests.tsx` (checkbox group + pass kinds to RPC)
- `supabase/migrations/<ts>_provisioning_defaults.sql`

## Out of scope

- Real Entra/Okta/Jamf API calls — still a queue HR/IT works manually, just pre-populated.
- Per-kind details (laptop model, VPN group). Single shared notes field for now; richer per-kind fields would need a dedicated dialog and can come next.
- Auto-creating equipment_issuance rows from the "Equipment" provisioning kind.
