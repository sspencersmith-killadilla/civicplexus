# Add "New Form" to the Forms Library

Today the Forms Library is read-only — form definitions can only be added via SQL. This plan adds an in-app editor so HR admins can create, edit, and version forms directly.

## Access control
- Existing DB policy `form_defs_hr_write` already restricts writes to HR — no schema/RLS changes needed.
- UI actions (New / Edit) are shown only when the current user has the HR role. Non-HR users continue to see the read-only library.

## Pages / UX

1. **Forms Library (`/forms`)** — add a top-right **"New form"** button (HR only). Each card gets an **Edit** action (HR only) alongside Preview.

2. **New route `/forms/new`** and **`/forms/$key/edit`** — the same editor component in create vs. edit mode. Layout:
   - **Left pane – Metadata & Schema Builder**
     - Metadata: `key` (slug, locked once created), `title`, `description`, `jurisdiction` (federal / state / local / other), `version` (number, defaults to 1 on new; on edit, an "Save as new version" toggle bumps it), `requires_signature` (switch).
     - Sections list: add/rename/reorder/delete sections.
     - Fields per section: add/reorder/delete. Per-field editor for `key`, `label`, `type` (text, email, tel, date, number, select, boolean, textarea), `required`, `sensitive`, and `options` (when `type = select`).
     - "Edit as JSON" collapsible fallback for power users — validates against the `FormSchema` shape before switching back.
   - **Right pane – Live Preview** — renders the current schema through the existing `<FormRunner>` in `readOnly` mode so HR sees exactly what employees will see.

3. **Save behavior**
   - Create: insert into `form_definitions` with `version = 1`.
   - Edit (same version): update the existing row.
   - Edit (save as new version): insert a new row with the same `key` and `version + 1`. The library already surfaces the highest version per key on the detail page; the library list will be updated to de-duplicate by `key` and show the latest version.

4. **Validation before save**
   - `key` matches `^[a-z0-9_-]+$` and is unique per version.
   - At least one section with at least one field.
   - Every field has a non-empty `key` and `label`; field keys unique within the form.
   - `select` fields must have ≥ 1 option.

## Technical details

- New files:
  - `src/routes/_authenticated/forms.new.tsx`
  - `src/routes/_authenticated/forms.$key.edit.tsx`
  - `src/components/form-schema-editor.tsx` (shared builder)
- Modify:
  - `src/routes/_authenticated/forms.index.tsx` — add HR-gated "New form" button and Edit action; de-dupe by `key` showing latest `version`.
- Data layer: use the browser Supabase client directly (writes are already RLS-gated to HR). No new server functions required.
- HR check: reuse existing `useCurrentUser` / role hook already used elsewhere (verify during implementation) to conditionally render admin actions.
- No database migration.

## Out of scope
- Field types beyond those already supported by `FormRunner` (no file upload, no repeatable groups, no conditional logic).
- Archiving/deleting form definitions (referential integrity with `form_submissions` makes this a separate feature).
