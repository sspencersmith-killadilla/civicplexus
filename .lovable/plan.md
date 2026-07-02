# Generate AI portraits for all officials

## What's already built (no code changes needed)
- `src/lib/official-photos.functions.ts` — `seedNextOfficialPhoto` server fn (auth-gated by `can_manage_officials`, calls `openai/gpt-image-2`, uploads to the `official-photos` bucket, sets `publish_photo = true`).
- `src/routes/_authenticated/admin-demo.tsx` — "Seed missing portraits" card with a loop that iterates until `done: true`.

## Current state
- `officials` table: 0 with photos, 67 missing.
- The seeder was wired but never executed, so the roster still shows initials placeholders.

## Plan
1. Add a small "Run now" convenience: bump the admin-demo loop cap from 80 → 120 so a single click covers all 67 (and leaves headroom for future officials) without needing multiple presses.
2. Verify the `official-photos` bucket is public and its RLS allows the seeder path `photos/{official_id}/seed-*.png` (it already is per prior migration — spot-check only).
3. Run the seeder end-to-end from **Admin → Demo account → Seed missing portraits**, watch progress, and confirm all 67 officials get a `photo_path` and appear on the public roster.
4. Report back with a count and a spot-check screenshot of the roster.

## Out of scope
- No changes to the prompt style, image model, size, or storage layout.
- No new UI surface beyond the existing demo admin card.
- Executive Analytics Dashboard (the previously-approved plan) stays queued and untouched by this task.

## Cost note
67 officials × 1 `openai/gpt-image-2` call at `quality: low`. One-time seed; re-runs only for newly-added officials.
