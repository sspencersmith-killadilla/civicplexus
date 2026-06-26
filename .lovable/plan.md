# Visual Org Chart

Build a new authenticated route `/org-chart` that renders the company hierarchy as a tree of employee cards (photo, name, title, department), driven by `employees.manager_id` and grouped/colored by `department`.

## Scope

- New page: `src/routes/_authenticated/org-chart.tsx`
- Module registry entry in `src/lib/modules.ts` (gated, default on) so super admins can toggle it
- Sidebar link in `src/components/app-shell.tsx`
- Photo loading via the existing `getEmployeePhotoUrl` server fn (signed URLs, batched + cached by path)
- No schema changes — uses existing `employees.manager_id`, `department`, `photo_path`, `job_title`, `status`

## UX

- **Tree view (default)**: top-down hierarchy starting from employees with no manager (CEO/root). Each node = compact card with circular photo (fallback initials), name, title, department chip. Click a card → navigates to `/employees/$id`.
- **Department view (toggle)**: groups employees by department, then nests by manager within each group. Useful when reporting lines are sparse.
- **Controls**: search (filters + highlights matches and their ancestors), department filter, expand/collapse all, zoom +/− and fit-to-screen, "Include inactive" toggle (defaults off — only `active` status).
- **Orphans panel**: collapsible list at the bottom for active employees missing both a manager and reports, so HR can see gaps.
- **Print / export**: browser print stylesheet (landscape, hides chrome) plus a "Download PNG" using `html-to-image` on the chart container.
- **Mobile**: switches to vertical stacked tree with horizontal scroll inside each level.

## Technical Details

- Data: single `supabase.from("employees").select("id, first_name, last_name, job_title, department, status, manager_id, photo_path")` query, then build the tree client-side in `useMemo`.
- Photos: collect distinct `photo_path` values, resolve in parallel via `Promise.all(getEmployeePhotoUrl(...))`, store in a `Map<path, url>` inside React Query (`queryKey: ["org-photo-urls", paths]`, 10 min stale). Avoids N server-fn calls on re-render.
- Rendering: use [`react-d3-tree`](https://www.npmjs.com/package/react-d3-tree) (pan/zoom + custom node renderer baked in, ~30KB). Custom node renders the card with `<Avatar>` from `@/components/ui/avatar.tsx`. Department color derived from a stable hash → HSL so colors are consistent without configuration.
- Export: add `html-to-image` for the PNG download.
- Performance: trees over ~200 nodes auto-collapse below depth 3; expand-on-click reveals more.

## Files

- Add: `src/routes/_authenticated/org-chart.tsx`
- Edit: `src/lib/modules.ts` (register `org_chart` module + route), `src/components/app-shell.tsx` (sidebar nav entry under People)
- Add deps: `react-d3-tree`, `html-to-image`

## Out of scope (call out)

- Editing reporting lines from the chart (still done on the employee record / via PAF)
- Dotted-line / matrixed relationships (single `manager_id` only)
- Server-rendered SVG/PDF export (browser-side PNG + print is sufficient for v1)
