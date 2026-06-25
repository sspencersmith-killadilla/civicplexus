## Goal
Make `/api/public/docs/user-guide` and `/api/public/docs/self-hosting` feel native on mobile: comfortable spacing, large tap targets, and a TOC that doesn't crowd the page.

## Changes (single file: `src/routes/api/public/docs/$file.ts`)

All changes are in the inline `<style>` block + a small markup tweak to the TOC. No new dependencies, no route changes, markdown rendering untouched.

### 1. Touch-friendly top nav
- Increase tap targets to ≥44px height on mobile (`padding: 10px 14px`, `min-height: 44px`).
- Stack brand + nav + download into a tidy 2-row layout under 640px instead of wrapping awkwardly.
- Make the Download button full-width on the smallest breakpoint so it's thumb-reachable.
- Add `-webkit-tap-highlight-color: transparent` and a visible `:active` state for feedback.

### 2. Simplified mobile TOC (collapsible)
- Desktop (≥880px): unchanged sticky sidebar.
- Mobile: convert the `<aside class="toc">` to a `<details class="toc-mobile">` element placed above the article. Closed by default; summary reads "On this page" with a chevron. This removes the always-on H3 noise.
- Show only H2 entries on mobile (hide `.lvl-3` under 880px) to keep the list short and scannable. H3s remain on desktop.
- TOC links get larger hit areas (`padding: 10px 12px`, `min-height: 40px`) and a divider between items.

### 3. Article spacing & typography on mobile
- Reduce article side padding to `20px` and round corners to `12px`; drop the heavy shadow on small screens.
- Body font 16px (prevents iOS zoom-on-focus); line-height 1.7 on mobile.
- H1 32px, H2 22px with `margin-top: 36px`; H3 18px.
- Lists: tighten left padding to `20px`, add `4px` vertical rhythm between items.
- Code blocks: `font-size: 13px`, allow horizontal scroll with `-webkit-overflow-scrolling: touch` and a subtle inset shadow indicating scrollability.
- Inline code: prevent overflow with `overflow-wrap: anywhere`.
- Tables: keep horizontal scroll but add a soft right-edge fade so users see there's more.
- Blockquotes: reduce padding to `12px 14px` on mobile.

### 4. Layout grid
- Mobile main padding: `16px` horizontal, `16px` top, `48px` bottom.
- Gap between TOC and article reduced to `16px` on mobile.
- Footer padding tightened on mobile.

### 5. Small JS tweak
- After building the TOC, also clone its list into the mobile `<details>` element (single source rendering, no duplication of the slug logic). Or simpler: render one `<ul>` and use CSS to display it inside both containers via `display: contents` — pick whichever keeps the script minimal (clone approach is safest).

### Out of scope
- No changes to markdown content, route paths, caching, or the `.md` download endpoint.
- No changes to desktop layout beyond what's needed to keep the new breakpoint clean.
