#!/usr/bin/env sh
set -eu

for command_name in age age-keygen; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
umask 077
secret_dir=$(mktemp -d "${TMPDIR:-/tmp}/plg-age-drill.XXXXXX")
identity="$secret_dir/identity"
backup=''
cleanup() {
  rm -f "$identity"
  rmdir "$secret_dir" 2>/dev/null || true
  if [ -n "$backup" ]; then
    rm -f "$backup" "$backup.sha256" "$backup.metadata"
  fi
}
trap cleanup EXIT HUP INT TERM

age-keygen --output "$identity" >/dev/null 2>&1
BACKUP_AGE_RECIPIENT=$(age-keygen -y "$identity")
export BACKUP_AGE_RECIPIENT
backup=$(sh "$script_dir/backup-postgres.sh" --local-only)
BACKUP_AGE_IDENTITY_FILE=$identity
export BACKUP_AGE_IDENTITY_FILE
database="plg_restore_drill_$(date -u +%Y%m%d%H%M%S)_$$"
sh "$script_dir/restore-postgres.sh" "$backup" "$database" --drill

echo 'Encrypted PostgreSQL backup/restore drill passed.'
