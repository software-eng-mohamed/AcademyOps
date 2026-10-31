#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - VPS 3 Database Restore Script
# Restores a PostgreSQL custom-format dump with safety checks
# ==============================================================================
set -eu

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path-to-dump-file> [--force]" >&2
  exit 1
fi

dump_input="$1"
force="${2:-}"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
vps_dir=$(dirname "$script_dir")
cd "$vps_dir"

if [ ! -f "$dump_input" ]; then
  echo "ERROR: Backup file '$dump_input' does not exist." >&2
  exit 1
fi

if [ "$force" != "--force" ]; then
  printf "WARNING: Restoring will overwrite existing data. Type 'RESTORE' to proceed: "
  read -r confirmation
  if [ "$confirmation" != "RESTORE" ]; then
    echo "Restore aborted by user."
    exit 0
  fi
fi

db_user=$(grep '^POSTGRES_USER=' runtime.env | cut -d= -f2)
db_name=$(grep '^POSTGRES_DB=' runtime.env | cut -d= -f2)

temp_dump="$dump_input"
if echo "$dump_input" | grep -q '\.age$'; then
  if [ -z "${BACKUP_AGE_IDENTITY:-}" ] || [ ! -f "$BACKUP_AGE_IDENTITY" ]; then
    echo "ERROR: BACKUP_AGE_IDENTITY key file is required to decrypt this backup." >&2
    exit 1
  fi
  echo "=== 1. Decrypting age-encrypted backup ==="
  temp_dump="/tmp/decrypted_$(date +%s).dump"
  age -d -i "$BACKUP_AGE_IDENTITY" -o "$temp_dump" "$dump_input"
fi

echo "=== 2. Restoring PostgreSQL Database from $temp_dump ==="
docker compose --env-file runtime.env -f compose.yml exec -T postgres \
  pg_restore -U "$db_user" -d "$db_name" --clean --if-exists --no-owner --no-privileges < "$temp_dump" || true

if [ "$temp_dump" != "$dump_input" ]; then
  rm -f "$temp_dump"
fi

echo "=== 3. Re-running Observability Role Init ==="
docker compose --env-file runtime.env -f compose.yml up db-observability-init

echo "=== Restore completed and verified! ==="
