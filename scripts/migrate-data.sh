#!/usr/bin/env bash
# One-shot data migration: Replit Postgres → Supabase Postgres.
#
# Prerequisites:
#   1. The target schema already exists in Supabase:  npm run db:push
#      (drizzle-kit uses DATABASE_URL_DIRECT from .env)
#   2. Env vars:
#        SOURCE_DATABASE_URL  — the old Replit database connection string
#                               (Replit workspace → Database → connection string)
#        TARGET_DATABASE_URL  — Supabase DIRECT connection string (port 5432,
#                               not the pooler; same value as DATABASE_URL_DIRECT)
#
# Usage:
#   SOURCE_DATABASE_URL=postgres://... TARGET_DATABASE_URL=postgres://... \
#     ./scripts/migrate-data.sh
set -euo pipefail

: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL to the Replit database URL}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL to the Supabase direct connection URL}"

DUMP_FILE="${DUMP_FILE:-/tmp/getgrant_data.sql}"

# Tables whose row counts we verify after the restore. sessions is excluded
# from the migration on purpose (transient Replit login sessions).
TABLES=(grants companies applications scraper_sources scraper_logs user_progress users)

count_rows() {
  local url="$1" table="$2"
  psql "$url" -X -A -t -c "SELECT COUNT(*) FROM \"$table\"" 2>/dev/null || echo "n/a"
}

echo "==> Source row counts (Replit)"
for t in "${TABLES[@]}"; do
  printf '  %-20s %s\n' "$t" "$(count_rows "$SOURCE_DATABASE_URL" "$t")"
done

echo "==> Dumping data from Replit (public schema, data only)"
pg_dump "$SOURCE_DATABASE_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --schema=public \
  --exclude-table-data=sessions \
  --file="$DUMP_FILE"

echo "==> Restoring into Supabase"
# session_replication_role=replica disables FK triggers during the restore so
# table order doesn't matter (Supabase grants the postgres role this ability).
psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
SET session_replication_role = replica;
\i $DUMP_FILE
SET session_replication_role = DEFAULT;
SQL

echo "==> Target row counts (Supabase)"
for t in "${TABLES[@]}"; do
  printf '  %-20s %s\n' "$t" "$(count_rows "$TARGET_DATABASE_URL" "$t")"
done

echo ""
echo "Compare the two lists above — every table should match the source."
echo "Expected magnitudes: grants ≈ 1750; sessions intentionally not migrated."
