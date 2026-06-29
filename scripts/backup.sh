#!/usr/bin/env bash
# Nightly backup: pg_dump + storage bucket sync to a local or S3 destination.
# Usage:  BACKUP_DIR=/var/backups/civicplexus ./scripts/backup.sh
set -euo pipefail
[ -f .env ] && { set -a; . ./.env; set +a; }
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/$STAMP"
mkdir -p "$OUT"

echo "› Dumping database to $OUT/db.sql.gz"
pg_dump --no-owner --no-privileges "$SUPABASE_DB_URL" | gzip > "$OUT/db.sql.gz"

echo "› Capturing schema-only snapshot for fast inspection"
pg_dump --schema-only --no-owner --no-privileges "$SUPABASE_DB_URL" > "$OUT/schema.sql"

# Storage buckets: requires supabase CLI logged in; skip silently if unavailable.
if command -v supabase >/dev/null 2>&1 && [ -n "${SUPABASE_PROJECT_ID:-}" ]; then
  for b in onboarding-documents job-applications training-evidence offer-letters \
           payroll-exports compliance-exports employee-photos careers-brochures; do
    echo "› Syncing bucket $b"
    supabase storage cp -r "ss:///$b" "$OUT/storage/$b" --project-ref "$SUPABASE_PROJECT_ID" 2>/dev/null || true
  done
fi

echo "› Verifying dump"
gunzip -t "$OUT/db.sql.gz"
sha256sum "$OUT"/* > "$OUT/SHA256SUMS"
echo "✓ Backup complete: $OUT"

# Retain last 30 backups
ls -1dt "$BACKUP_DIR"/*/ 2>/dev/null | tail -n +31 | xargs -r rm -rf
