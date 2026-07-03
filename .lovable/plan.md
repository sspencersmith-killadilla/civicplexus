# Fix sub-pages that render the same parent page

## What's wrong

The sub-page files (Compare applicants, Print, Archive, Onboarding templates/report, application detail) all exist and are registered — that's why the URL changes. But in TanStack routing, when a page has sub-pages, the parent page must render an `<Outlet />` slot where the sub-page appears. The Elected Officials page renders its own full content and has no `<Outlet />`, so every sub-page URL just shows the parent page again. Nothing "didn't take" — the child pages simply have nowhere to render.

A scan found the same bug on 3 other pages:

- **/admin-officials** → applications/$id, applications/compare, archive, print, onboarding-templates, onboarding-report (the ones you're hitting)
- **/interviews/$id** → its "room" sub-page
- **/policies** → policy detail page ($id)
- **/review-cycles/$id** → its calibration sub-page

## The fix (same pattern for each)

For each affected parent:

1. Move the parent page's current content into a new `*.index.tsx` sibling file (e.g. `admin-officials.index.tsx`) — this becomes the page shown at the base URL.
2. Turn the original parent file into a thin layout that just renders `<Outlet />`, so sub-pages render when their URL is active.
3. The route tree regenerates automatically; no links need to change.

## Verification

- Build the app and open `/admin-officials`, `/admin-officials/applications/compare`, `/admin-officials/print`, and an application detail URL in a headless browser to confirm each shows distinct content.
- Spot-check `/policies/<id>`, an interview room, and a calibration page the same way.

No database or backend changes needed — this is purely route structure.