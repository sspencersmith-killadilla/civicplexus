## 1. Seed AI photos for all 29 demo employees

- Add a one-shot server function `seedDemoEmployeePhotos` (HR-admin gated) in `src/lib/employee-photos.functions.ts`:
  - For each employee missing `photo_path`, generate a professional ID-badge-style headshot via the Lovable AI Gateway (`openai/gpt-image-2`, square, neutral background) with a prompt seeded from first/last name + job title (e.g. *"professional corporate headshot of a person named Maria Lopez, library aide, friendly smile, neutral grey studio background, soft lighting, shoulders up, photorealistic"*).
  - Upload the resulting PNG to the existing `employee-photos` storage bucket at `employees/{id}/seed.png` using `supabaseAdmin`.
  - Update `employees.photo_path`.
  - Run sequentially with a small delay; return per-employee status.
- Add a "Seed demo photos" button on `/admin-demo` so a single click backfills all missing photos. Idempotent — skips employees that already have a photo unless "Regenerate all" is toggled.

Note: AI portraits are synthetic likenesses; we will not target real people. Prompts use generic descriptors plus the demo name only.

## 2. Polish the org chart

Rework `src/routes/_authenticated/org-chart.tsx`:

- **Root label**: replace hardcoded `"Organization"` with `org_settings.org_name` (loaded via a small `getOrgName` server fn or existing org settings query). Fallback to "Organization" only if unset.
- **Visual cleanup**:
  - Larger, rounded card nodes (240×96) with subtle gradient header strip in the department color rather than a full border; soft shadow; hover lift.
  - Circular avatar with white ring; initials fallback uses the same dept color at lower saturation.
  - Two-line name (semibold, 14px), job title (12px muted), department chip pinned bottom-right.
  - Replace `pathFunc="step"` with smooth `"diagonal"` connectors, thinner stroke, muted color.
  - Root node becomes a pill card showing org name + employee count, primary-tinted.
  - Use `--card`, `--border`, `--muted-foreground` tokens (no hardcoded greys); ensure dark-mode legibility.
- **Layout**: increase `nodeSize` to `{x: 280, y: 180}`, tighter sibling separation, add a faint dotted background grid via CSS.
- **Legend**: small department color legend chip row above the canvas.
- **Controls**: group zoom/print/export into a single rounded toolbar; show current zoom %.
- Keep all existing filter/search/orphan logic intact.

## Technical notes

- Image generation runs server-side only; uses `LOVABLE_API_KEY` (already configured). Non-streaming JSON response is fine here since we just persist the final PNG.
- Storage writes use `supabaseAdmin` inside the handler (per server-side rules).
- Org chart changes are presentation-only — no schema or query changes besides reading `org_settings.org_name`.