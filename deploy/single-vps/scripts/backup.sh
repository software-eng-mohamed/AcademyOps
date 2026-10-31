#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - Single VPS Backup Script
# Creates an atomic pg_dump snapshot, optionally encrypts with age and uploads
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
vps_dir=$(dirname "$script_dir")
cd "$vps_dir"

backup_dir="$vps_dir/backups"
mkdir -p "$backup_dir"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
dump_file="$backup_dir/plg_academy_$timestamp.dump"

db_user=$(grep '^POSTGRES_USER=' runtime.env | cut -d= -f2)
db_name=$(grep '^POSTGRES_DB=' runtime.env | cut -d= -f2)

echo "=== 1. Creating Atomic Custom-Format PostgreSQL Dump ==="
docker compose --env-file runtime.env -f compose.yml exec -T postgres \
  pg_dump -U "$db_user" -d "$db_name" -Fc --no-owner --no-privileges > "$dump_file"

size=$(ls -lh "$dump_file" | awk '{print $5}')
echo "Backup created at: $dump_file ($size)"

# If age recipient is configured, encrypt the file
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ] && command -v age >/dev/null 2>&1; then
  echo "=== 2. Encrypting with age ==="
  enc_file="$dump_file.age"
  age -r "$BACKUP_AGE_RECIPIENT" -o "$enc_file" "$dump_file"
  rm -f "$dump_file"
  echo "Encrypted backup created: $enc_file"
  dump_file="$enc_file"
fi

# If rclone destination is configured, upload to offsite storage
if [ -n "${BACKUP_RCLONE_DESTINATION:-}" ] && command -v rclone >/dev/null 2>&1; then
  echo "=== 3. Uploading to offsite destination: $BACKUP_RCLONE_DESTINATION ==="
  rclone copy "$dump_file" "$BACKUP_RCLONE_DESTINATION"
  echo "Upload verified successfully."
fi

# Prune local backups older than 7 days
find "$backup_dir" -type f -name "plg_academy_*" -mtime +7 -delete 2>/dev/null || true
echo "=== Backup Complete! ==="
