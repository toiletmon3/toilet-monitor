#!/bin/bash
# ============================================================
# ToiletMon — Automated PostgreSQL Backup Script
# ============================================================
# Performs a daily pg_dump, verifies the dump, compresses it,
# and rotates old backups. Designed to be run via cron.
#
# Usage:
#   bash scripts/backup.sh              # uses defaults
#   BACKUP_DIR=/custom/path bash scripts/backup.sh
#
# Cron (installed automatically by deploy.sh):
#   0 3 * * * /opt/toilet-monitor/scripts/backup.sh >> /var/log/toilet/backup.log 2>&1
# ============================================================

set -euo pipefail

# --- Configuration (overridable via env) ---
BACKUP_DIR="${BACKUP_DIR:-/var/log/toilet/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DB_CONTAINER="${DB_CONTAINER:-toilet_postgres}"
DB_NAME="${DB_NAME:-toilet_monitor}"
DB_USER="${DB_USER:-postgres}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/daily_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"
LOG_PREFIX="[backup $(date '+%Y-%m-%d %H:%M:%S')]"

mkdir -p "$BACKUP_DIR"

log()  { echo "$LOG_PREFIX $*"; }
fail() { echo "$LOG_PREFIX ERROR: $*" >&2; exit 1; }

# --- Step 1: Dump the database ---
log "Starting PostgreSQL backup..."

DUMP_OK=false

# Try 1: host pg_dump with DATABASE_URL (works when Postgres is local or env is loaded)
if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump &>/dev/null; then
  if pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>/dev/null; then
    DUMP_OK=true
    log "Dump created via host pg_dump + DATABASE_URL"
  fi
fi

# Try 2: docker exec into the Postgres container
if [ "$DUMP_OK" = false ] && command -v docker &>/dev/null; then
  if docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null; then
    DUMP_OK=true
    log "Dump created via docker exec ($DB_CONTAINER)"
  fi
fi

# Try 3: load .env.production and retry
if [ "$DUMP_OK" = false ]; then
  for envfile in /opt/toilet-monitor/.env.production /opt/toilet-monitor/.env; do
    if [ -f "$envfile" ]; then
      set -a; source "$envfile"; set +a
      if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump &>/dev/null; then
        if pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>/dev/null; then
          DUMP_OK=true
          log "Dump created via host pg_dump + $envfile"
          break
        fi
      fi
    fi
  done
fi

if [ "$DUMP_OK" = false ]; then
  rm -f "$BACKUP_FILE"
  fail "Could not create database dump — no method succeeded"
fi

# --- Step 2: Verify the dump is valid ---
DUMP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo 0)

if [ "$DUMP_SIZE" -lt 100 ]; then
  rm -f "$BACKUP_FILE"
  fail "Dump file is suspiciously small (${DUMP_SIZE} bytes) — aborting"
fi

if ! head -1 "$BACKUP_FILE" | grep -qE '^--'; then
  rm -f "$BACKUP_FILE"
  fail "Dump file does not look like a valid pg_dump output — aborting"
fi

log "Dump verified: ${DUMP_SIZE} bytes"

# --- Step 3: Compress ---
gzip "$BACKUP_FILE"
COMPRESSED_SIZE=$(stat -c%s "$COMPRESSED_FILE" 2>/dev/null || stat -f%z "$COMPRESSED_FILE" 2>/dev/null || echo 0)
log "Compressed to ${COMPRESSED_SIZE} bytes: $COMPRESSED_FILE"

# --- Step 4: Rotate old backups ---
DELETED_COUNT=0
while IFS= read -r old_file; do
  rm -f "$old_file"
  DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "$BACKUP_DIR" -name "daily_*.sql.gz" -mtime +"$RETENTION_DAYS" 2>/dev/null || true)

if [ "$DELETED_COUNT" -gt 0 ]; then
  log "Rotated $DELETED_COUNT backup(s) older than $RETENTION_DAYS days"
fi

# --- Step 5: Summary ---
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "daily_*.sql.gz" 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
log "Backup complete. Total: $TOTAL_BACKUPS backup(s), disk usage: $TOTAL_SIZE"
log "Latest: $COMPRESSED_FILE"
