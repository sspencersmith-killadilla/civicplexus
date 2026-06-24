## Problem

The PAF "New personnel action" submission fails with:
> Could not find the 'kind' column of 'approval_chains' in the schema cache

`src/lib/paf.functions.ts` writes to `approval_chains.kind`, but the table's actual columns are `entity_type`, `entity_id`, `status`, `current_stage`, `created_by`. So every PAF submit blows up before the personnel_action row is even inserted.

## Fix

Add the missing column to `approval_chains` so existing PAF code (and any future approval-chain caller using a `kind` label) works, without disturbing the existing `entity_type`/`entity_id` shape used elsewhere.

### Migration

```sql
ALTER TABLE public.approval_chains
  ADD COLUMN IF NOT EXISTS kind text;
CREATE INDEX IF NOT EXISTS approval_chains_kind_idx ON public.approval_chains (kind);
```

No RLS / grant changes — only a new nullable column on an existing table.

### Why not change the code instead

`paf.functions.ts` already uses `kind` as a free-form label (`paf_${action_type}`) which is more descriptive than overloading `entity_type='paf'`. Adding the column is a one-line, non-breaking change; reshaping the insert to use `entity_type`/`entity_id` would also require updating the PAF detail page query and any approval dashboards that read chains.

## Verification

After the migration runs:
1. Open `/paf`, click **New PAF**, fill it out, click **Submit for approval** → expect a toast with the new PAF number, dialog closes, the new row appears in the list.
2. Open the new PAF → confirm the approval chain shows Stage 1 (supervisor) and Stage 2 (hr_admin) pending.
