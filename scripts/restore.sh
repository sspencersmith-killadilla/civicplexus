#!/usr/bin/env bash
# Restore a CivicPlexus backup created by scripts/backup.sh.
# Usage:  ./scripts/restore.sh /var/backups/civicplexus/20260101T000000Z
set -euo pipefail
SRC="${1:?usage: restore.sh <backup-dir>}"
[ -f .env ] && { set -a; . ./.env; set +a; }
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL must be set}"
[ -f "$SRC/db.sql.gz" ] || { echo "✗ $SRC/db.sql.gz missing" >&2; exit 1; }

echo "› Verifying checksums"
( cd "$SRC" && sha256sum -c SHA256SUMS )

read -r -p "This will OVERWRITE the database at SUPABASE_DB_URL. Type 'restore' to continue: " ack
[ "$ack" = "restore" ] || { echo "Aborted."; exit 1; }

echo "› Restoring database"
gunzip -c "$SRC/db.sql.gz" | psql "$SUPABASE_DB_URL"
echo "✓ Restore complete. Run a smoke test before reopening to users."
