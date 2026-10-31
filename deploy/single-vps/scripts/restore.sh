#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - Single VPS Restore Script
# Restores a custom-format pg_dump into PostgreSQL
# ==============================================================================
set -eu

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path-to-dump-file>" >&2
  exit 1
fi

dump_input="$1"
if [ ! -f "$dump_input" ]; then
  echo "ERROR: File not found: $dump_input" >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
vps_dir=$(dirname "$script_dir")
cd "$vps_dir"

db_user=$(grep '^POSTGRES_USER=' runtime.env | cut -d= -f2)
db_name=$(grep '^POSTGRES_DB=' runtime.env | cut -d= -f2)

# If file is encrypted with age, decrypt first
target_dump="$dump_input"
if echo "$dump_input" | grep -q '\.age$'; then
  if [ -z "${BACKUP_AGE_IDENTITY:-}" ]; then
    echo "ERROR: BACKUP_AGE_IDENTITY environment variable required to decrypt $dump_input" >&2
    exit 1
  fi
  decrypted_file="/tmp/restore_$(date +%s).dump"
  age -d -i "$BACKUP_AGE_IDENTITY" -o "$decrypted_file" "$dump_input"
  target_dump="$decrypted_file"
fi

echo "WARNING: This will restore data into database '$db_name'."
printf "Are you sure you want to proceed? (yes/NO): "
read -r confirm
if [ "$confirm" != "yes" ]; then
  echo "Restore cancelled."
  [ "$target_dump" != "$dump_input" ] && rm -f "$target_dump"
  exit 0
fi

echo "Stopping application instances to avoid active connection interference..."
docker compose --env-file runtime.env -f compose.yml stop api-a api-b worker

echo "Restoring database snapshot..."
cat "$target_dump" | docker compose --env-file runtime.env -f compose.yml exec -T postgres \
  pg_restore -U "$db_user" -d "$db_name" --clean --if-exists --no-owner --no-privileges

if [ "$target_dump" != "$dump_input" ]; then
  rm -f "$target_dump"
fi

echo "Restarting application instances..."
docker compose --env-file runtime.env -f compose.yml start api-a api-b worker

echo "=== Restore Complete! Checking health... ==="
sh scripts/healthcheck.sh
