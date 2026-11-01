#!/usr/bin/env bash
# ==============================================================================
# BookLoop Database Snapshot & Backup Utility
# Usage:
#   export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.ofaybxxfymkzceydqfia.supabase.co:5432/postgres"
#   ./scripts/backup-db.sh
# ==============================================================================

set -euo pipefail

DB_URL="${DATABASE_URL:-}"
BACKUP_DIR="./backups"

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set."
  echo "Find your connection string in Supabase Dashboard -> Project Settings -> Database"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="$BACKUP_DIR/bookloop_backup_$TIMESTAMP.sql"

echo "Dumping database to $OUTPUT_FILE..."
pg_dump --clean --if-exists --no-owner --no-privileges -d "$DB_URL" -f "$OUTPUT_FILE"

echo "Backup created successfully: $OUTPUT_FILE"

