# Plan: AI portraits for elected & appointed officials

All officials are fictitious, so we can generate photorealistic AI portraits using the same pattern that already seeds employee photos — no changes to public-facing pages needed beyond what already renders `photo_url`.

## What we'll build

1. **New server function** `seedNextOfficialPhoto` in `src/lib/official-photos.functions.ts`
   - Mirrors `seedNextDemoPhoto` from `employee-photos.functions.ts`.
   - Auth: clerk/HR admin (reuse `can_manage_officials`).
   - Picks the next official with `photo_path IS NULL` (or, in regenerate mode, walks past a cursor).
   - Builds a prompt from the official's name + current seat/title (e.g., "Mayor", "City Council Member — Place 3", "Planning & Zoning Commissioner") to get variety.
   - Calls Lovable AI Gateway `openai/gpt-image-2`, `size: 1024x1024`, `quality: low`, non-streaming (server job → storage, per docs).
   - Uploads to the existing `official-photos` bucket at `photos/{official_id}/seed-{ts}.png`.
   - Updates `officials.photo_path` **and** sets `publish_photo = true` so the roster shows it immediately.
   - Returns `{ done, remaining, cursor, official: { id, name } }`.

2. **Seeder UI** — extend the existing `src/routes/_authenticated/admin-demo.tsx` "Seed demo data" page
   - Add a second card: **"Generate official portraits"** with the same loop pattern as the employee seeder (button that iterates until `done`, progress counter, regenerate toggle).
   - Reuses the existing progress/loop UX so nothing new to learn.

3. **Prompt variety** to avoid samey portraits across ~50 officials
   - Vary by role category (elected vs appointed), age range hints per typical demographic diversity for a Texas small-city context, and background lighting keywords.
   - Same neutral studio background family so the roster looks cohesive.
   - Explicitly instructs "not a real person, fictional portrait" and "no text, no logo, no watermark".

## What we're NOT doing this turn

- **Officials onboarding module** — you asked about it earlier but haven't confirmed scope. I'll hold that as a separate follow-up so this turn stays focused on portraits. Say the word and I'll draft a plan for it next (checklist templates per body, oath/bond/ethics/COI/TOMA-PIA doc packet, reminders, provisioning, mirroring the employee onboarding stack).

## Cost note

~50 officials × 1 gateway image call each at `quality: low`. Runs on-demand from the demo admin page — not automatic.

## Files touched

- **New:** `src/lib/official-photos.functions.ts`
- **Edited:** `src/routes/_authenticated/admin-demo.tsx` (add second seeder card)

No schema changes — `photo_path`, `publish_photo`, the `official-photos` bucket, and its RLS policies already exist.
