#!/usr/bin/env bash
# backup_postgres.sh
# Dumps the DeWordle PostgreSQL database using pg_dump with gzip compression.
# Retains the latest 7 daily backup archive files.

set -euo pipefail

DB_USER="${DB_USER:-dewordle}"
DB_NAME="${DB_NAME:-dewordle}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d)
BACKUP_FILE="$BACKUP_DIR/dewordle_backup_${TIMESTAMP}.sql.gz"
RETAIN_DAYS=7

mkdir -p "$BACKUP_DIR"

echo "Backing up database '$DB_NAME' to $BACKUP_FILE..."
PGPASSWORD="${DB_PASSWORD:-}" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
echo "Backup complete: $BACKUP_FILE"

# Remove backups older than RETAIN_DAYS
find "$BACKUP_DIR" -name "dewordle_backup_*.sql.gz" -mtime +$RETAIN_DAYS -delete
echo "Old backups (older than $RETAIN_DAYS days) removed."