# Add volunteer sign-in to the public volunteer pages

## The problem

All `/serve/volunteer*` pages still behave like anonymous intake:

- `/serve/volunteer` renders the old "Submit application" form and never mentions the new volunteer accounts.
- `/serve/volunteer/jobs` shows a small "Create a volunteer account" text link but no sign-in affordance.
- `/serve/volunteer/clock` only offers last-name + PIN kiosk lookup — no way for a signed-in volunteer to self-clock.
- The `/auth` page has a volunteer checkbox, but nothing on the public volunteer pages routes users to it, so volunteers can't discover the sign-in / sign-up flow.

## Changes

### 1. Shared header for `/serve/volunteer*` pages

Add a small reusable `VolunteerPublicHeader` (new file `src/components/volunteer-public-header.tsx`) that renders on all three public volunteer pages:

- Left: "Volunteer with the city" title + subtitle.
- Right (session-aware, uses `supabase.auth.getUser()` + `onAuthStateChange`):
  - Signed out → **Sign in** and **Create volunteer account** buttons that link to `/auth` (with `?volunteer=1` for the create button).
  - Signed in → **Go to my volunteer portal** button linking to `/volunteer`, plus a **Sign out** link.

### 2. `/serve/volunteer` becomes a landing page, not an intake form

Rewrite `src/routes/serve.volunteer.tsx`:

- Hero explaining volunteering + the new account model.
- Primary CTA: **Create volunteer account** → `/auth?volunteer=1`.
- Secondary CTA: **Sign in** → `/auth`.
- Tertiary link: **Browse open opportunities** → `/serve/volunteer/jobs`.
- Remove the anonymous "insert into volunteers" form entirely — profile creation now happens inside the signed-in portal at `/volunteer/profile`.
- If the user is already signed in and has (or is) a volunteer, redirect to `/volunteer`.

### 3. `/serve/volunteer/jobs` — clearer sign-in CTA

Update `src/routes/serve.volunteer.jobs.tsx`:

- Mount the shared header.
- Replace the inline text link with the header's Sign in / Create account buttons.
- When signed in, each shift's "Sign up" button links straight into `/volunteer/find` (already implemented).

### 4. `/serve/volunteer/clock` — offer self-service clock for signed-in volunteers

Update `src/routes/serve.volunteer.clock.tsx`:

- Mount the shared header.
- If signed in as a volunteer, show a banner: "You're signed in — use your portal to clock in and out" with a button to `/volunteer`.
- Keep the last-name + PIN kiosk lookup as the fallback for shared kiosks / walk-ups.

### 5. `/auth` — honor `?volunteer=1`

Update `src/routes/auth.tsx`:

- Read a `volunteer` search param; when present, default `mode = "signup"` and pre-check the "I'm signing up as a volunteer" box.
- No change to redirect logic (`routeAfterAuth` already sends volunteers to `/volunteer`).

## Files touched

- `src/components/volunteer-public-header.tsx` (new)
- `src/routes/serve.volunteer.tsx` (rewritten — landing page)
- `src/routes/serve.volunteer.jobs.tsx` (header swap)
- `src/routes/serve.volunteer.clock.tsx` (header + signed-in banner)
- `src/routes/auth.tsx` (respect `?volunteer=1`)

No database, RLS, or server-function changes — the volunteer portal, `volunteers.user_id`, and sign-up flow are already in place.
