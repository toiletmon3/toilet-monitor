#!/bin/bash
# ============================================================
# ToiletMon — Database Restore Script
# ============================================================
# Restores a PostgreSQL backup created by backup.sh.
# Supports both .sql and .sql.gz files.
#
# Usage:
#   bash scripts/backup-restore.sh                    # interactive: pick from list
#   bash scripts/backup-restore.sh /path/to/backup.sql.gz   # direct restore
# ============================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/log/toilet/backups}"
DB_CONTAINER="${DB_CONTAINER:-toilet_postgres}"
DB_NAME="${DB_NAME:-toilet_monitor}"
DB_USER="${DB_USER:-postgres}"

log()  { echo "[restore $(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { echo "[restore $(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2; exit 1; }

# --- Pick or accept a backup file ---
RESTORE_FILE="${1:-}"

if [ -z "$RESTORE_FILE" ]; then
  echo ""
  echo "=== Available backups ==="
  echo ""

  mapfile -t BACKUPS < <(find "$BACKUP_DIR" -name "*.sql*" -type f 2>/dev/null | sort -r)

  if [ ${#BACKUPS[@]} -eq 0 ]; then
    fail "No backup files found in $BACKUP_DIR"
  fi

  for i in "${!BACKUPS[@]}"; do
    SIZE=$(du -h "${BACKUPS[$i]}" | cut -f1)
    DATE=$(stat -c%y "${BACKUPS[$i]}" 2>/dev/null | cut -d. -f1 || stat -f"%Sm" "${BACKUPS[$i]}" 2>/dev/null || echo "unknown")
    printf "  [%d] %s (%s, %s)\n" "$((i+1))" "$(basename "${BACKUPS[$i]}")" "$SIZE" "$DATE"
  done

  echo ""
  read -rp "Select backup number (1-${#BACKUPS[@]}): " SELECTION

  if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [ "$SELECTION" -lt 1 ] || [ "$SELECTION" -gt ${#BACKUPS[@]} ]; then
    fail "Invalid selection"
  fi

  RESTORE_FILE="${BACKUPS[$((SELECTION-1))]}"
fi

if [ ! -f "$RESTORE_FILE" ]; then
  fail "File not found: $RESTORE_FILE"
fi

log "Selected backup: $RESTORE_FILE"

# --- Safety confirmation ---
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  WARNING: This will DROP and recreate the $DB_NAME database  ║"
echo "║  All current data will be replaced with the backup.         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
read -rp "Type 'RESTORE' to confirm: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
  log "Aborted by user."
  exit 0
fi

# --- Create a safety backup of current state before restoring ---
SAFETY_BACKUP="$BACKUP_DIR/pre_restore_$(date +%Y%m%d_%H%M%S).sql"
log "Creating safety backup of current database..."

SAFETY_OK=false
if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump &>/dev/null; then
  pg_dump "$DATABASE_URL" > "$SAFETY_BACKUP" 2>/dev/null && SAFETY_OK=true
elif command -v docker &>/dev/null; then
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$SAFETY_BACKUP" 2>/dev/null && SAFETY_OK=true
fi

if [ "$SAFETY_OK" = true ]; then
  gzip "$SAFETY_BACKUP"
  log "Safety backup saved: ${SAFETY_BACKUP}.gz"
else
  log "WARNING: Could not create safety backup — proceeding anyway"
  rm -f "$SAFETY_BACKUP"
fi

# --- Decompress if needed ---
SQL_FILE="$RESTORE_FILE"
TEMP_DECOMPRESSED=false

if [[ "$RESTORE_FILE" == *.gz ]]; then
  SQL_FILE="/tmp/toilet_restore_$$.sql"
  gunzip -c "$RESTORE_FILE" > "$SQL_FILE"
  TEMP_DECOMPRESSED=true
  log "Decompressed to temporary file"
fi

# --- Restore ---
log "Restoring database..."

RESTORE_OK=false

if [ -n "${DATABASE_URL:-}" ] && command -v psql &>/dev/null; then
  # Drop and recreate via host psql
  psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
  psql "$DATABASE_URL" < "$SQL_FILE" > /dev/null 2>&1 && RESTORE_OK=true
elif command -v docker &>/dev/null; then
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null || true
  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$SQL_FILE" > /dev/null 2>&1 && RESTORE_OK=true
fi

# Clean up temp file
if [ "$TEMP_DECOMPRESSED" = true ]; then
  rm -f "$SQL_FILE"
fi

if [ "$RESTORE_OK" = true ]; then
  log "Database restored successfully from: $(basename "$RESTORE_FILE")"
  echo ""
  echo "Next steps:"
  echo "  1. Restart the server:  pm2 restart toilet-server"
  echo "  2. Verify the app works: curl -s https://toiletcleanpro.duckdns.org/api/health"
  echo ""
else
  fail "Restore failed — check database connectivity"
fi
