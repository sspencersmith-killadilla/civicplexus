## 1. Fix "submit for approval" error

Root cause: `submitRequisitionForApproval` throws **"No approvers available; ensure an HR admin and supervisor exist."** when the signed-in user has no supervisor record or no `hr_admin` exists in `user_roles`. The wizard surfaces this as a hard error with no recovery.

Fix:
- In `src/lib/jobs.functions.ts > submitRequisitionForApproval`, when no approvers can be resolved, return `{ chain_id: null, skipped: true, reason: "no_approvers" }` instead of throwing. Still flip status to `pending_approval` only if a chain was created; otherwise leave as `draft` and surface the reason.
- In the wizard step 2 (`src/routes/_authenticated/jobs.index.tsx`), if the response comes back with `skipped: true`, advance to step 3 with an inline notice ("No approvers configured — you can post directly if your role allows it") instead of toasting an error.
- Also expand `defaultApproverChain` to fall back to the requisition's `hiring_manager_id` when no supervisor link exists.

## 2. Fix the "Apply" button on the public posting page

Root cause to verify in build mode: the link target exists (`/careers/$slug/apply`), but the current `careers.$slug.tsx` wraps the apply button in a `<Link>` that points to a route whose loader depends on the same query. If the loader is unhydrated or the route hasn't been preloaded, the click can appear to do nothing on a fresh hit while query state warms up.

Fix:
- Replace the inline `<Link><Button /></Link>` pattern with `<Button asChild><Link …/></Button>` so the button itself is the anchor (no nested interactive elements; resolves accessibility + some pointer issues).
- Add a `notFoundComponent` and a real `pendingComponent` (small spinner card) on `careers.$slug.apply.tsx` so the navigation always renders something immediately even while the loader runs.
- Quick repro check in build mode via Playwright on `/careers/patrol-officer` to confirm the click navigates; iterate if the underlying issue is different (e.g. a runtime error in the apply route).

## 3. Structured job-posting template tied to existing positions

Replace the free-form Details step in the wizard with a two-mode form:

**Step 0 — Pick a position (job classification)**
- New dropdown loads from `public.positions` (filterable by `status='open'`, sorted by `title`). Selecting one auto-fills:
  - `title` ← `positions.title`
  - `department` ← `positions.department`
  - `position_id` ← `positions.id`
  - `worker_type_id` ← `positions.worker_type_id`
  - `employment_type` ← derived from `worker_type` (full_time / part_time)
- Keep a "Custom (no classification)" escape hatch that falls back to today's free-text title.

**Step 1 — Compose posting (structured fields)**
Split the single `description` textarea into named sections that map onto existing columns and a new structured JSON column:
- `summary` — Position overview (already exists)
- `description` — "Essential Functions" bullet list (textarea, markdown-friendly)
- `requirements` — "Knowledge, Skills, Abilities & Behaviors" + "Required Qualifications" (two textareas; concatenated server-side with headings into `requirements`)
- `benefits` — kept as today
- New JSON column `posting_sections jsonb` on `job_requisitions` to store the structured pieces (`{ essential_functions, ksa, qualifications, physical_demands, supplemental }`) so the public page can render rich sections without parsing markdown.

A "Use template" button pre-fills the textareas with the Library Aide-style boilerplate the user pasted (essential functions, KSAs, required qualifications, physical demands, supplemental) as starter copy the user edits per position.

**Public page rendering (`src/routes/careers.$slug.tsx`)**
- Render the structured sections in order: Summary → Essential Functions → KSAs & Behaviors → Required Qualifications → Physical Demands → Supplemental → Benefits. Falls back to the legacy `description`/`requirements` text when `posting_sections` is empty so existing seed rows still display.
- Tighten the visual hierarchy (serif heading already in place; add section headings, subtle dividers, and a sticky "Apply for this role" CTA on desktop) so postings no longer feel bare.

### Migration
- Add `posting_sections jsonb not null default '{}'::jsonb` to `public.job_requisitions`.
- Update `listPublicRequisitions` / `getPublicRequisition` to project `posting_sections`.
- Update Zod `RequisitionInput` to accept the structured payload, and `createRequisition` / `updateRequisition` to store it.
- Backfill the two demo postings with realistic Patrol Officer / Accounting Clerk section content so the public careers page demos well.

### Out of scope
- Replacing the approvals workflow itself.
- Editing the positions catalog UI.
- Reworking the internal-careers page (it'll inherit the richer detail automatically via the shared query).
