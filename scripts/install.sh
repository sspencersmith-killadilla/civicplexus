#!/usr/bin/env bash
# CivicPlexus first-run installer.
# Verifies prerequisites, applies migrations against SUPABASE_DB_URL, and
# prints next steps. Safe to re-run — migrations are idempotent.
set -euo pipefail

say() { printf "\033[1;36m›\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

say "CivicPlexus installer"

command -v bun >/dev/null || die "bun is required (https://bun.sh)"
command -v psql >/dev/null || die "psql is required (postgresql-client)"
command -v supabase >/dev/null || die "supabase CLI is required (npm i -g supabase)"

[ -f .env ] || die "Missing .env — copy .env.example and fill in your values."
set -a; . ./.env; set +a

: "${SUPABASE_URL:?SUPABASE_URL must be set}"
: "${SUPABASE_PUBLISHABLE_KEY:?SUPABASE_PUBLISHABLE_KEY must be set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY must be set}"
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL must be set}"

say "Installing dependencies"
bun install --frozen-lockfile

say "Verifying database connectivity"
psql "$SUPABASE_DB_URL" -c "select 'ok' as health;" >/dev/null \
  || die "Cannot reach SUPABASE_DB_URL"

say "Applying migrations"
supabase db push --db-url "$SUPABASE_DB_URL"

say "Building app"
bun run build

echo
echo "✓ Install complete."
echo
echo "Next steps:"
echo "  1. Create first HR admin:  psql \"\$SUPABASE_DB_URL\" -f scripts/seed-first-admin.sql -v email=you@city.gov"
echo "  2. Start the app:          bun run start   (or bun run dev)"
echo "  3. Probe health:           curl https://your-host/api/public/health"
echo "  4. Schedule backups:       see scripts/backup.sh"
