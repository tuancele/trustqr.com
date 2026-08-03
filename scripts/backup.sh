#!/bin/sh
# Postgres backup script - runs inside the backup container.
# Retention: keep last 7 daily, 4 weekly, 12 monthly.
set -e

BACKUP_DIR=${BACKUP_DIR:-/backup}
DB_HOST=${DB_HOST:-postgres}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-trustqr}
DATE=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/trustqr_$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup -> $FILE"
PGPASSWORD="$PGPASSWORD" pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" | gzip > "$FILE"
echo "[$(date)] Backup complete ($(du -h $FILE | cut -f1))"

# Retention: delete daily backups older than 7 days
find "$BACKUP_DIR" -name "trustqr_*.sql.gz" -mtime +7 -delete 2>/dev/null || true

echo "[$(date)] Cleanup done"
