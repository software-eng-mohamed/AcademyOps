#!/usr/bin/env sh
set -eu
LC_ALL=C
export LC_ALL

[ "$#" -eq 1 ] || { echo 'Usage: prune-local-backups.sh RETENTION_DAYS' >&2; exit 2; }
retention_days=$1
case "$retention_days" in '' | *[!0-9]*) echo 'RETENTION_DAYS must be numeric' >&2; exit 2 ;; esac
[ "$retention_days" -ge 1 ] && [ "$retention_days" -le 30 ] || {
  echo 'RETENTION_DAYS must be between 1 and 30' >&2
  exit 2
}

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
backup_dir="$deploy_dir/backups"
[ -d "$backup_dir" ] && [ ! -L "$backup_dir" ] || {
  echo 'Backup directory must be a real, non-symlink directory' >&2
  exit 1
}
resolved_backup_dir=$(readlink -f -- "$backup_dir")
[ "$resolved_backup_dir" = "$deploy_dir/backups" ] || {
  echo 'Backup directory escaped the deployment directory' >&2
  exit 1
}

find "$resolved_backup_dir" -mindepth 1 -maxdepth 1 -type f ! -type l \
  \( -name 'plg-*.dump.age' -o -name 'plg-*.dump.age.sha256' -o -name 'plg-*.dump.age.metadata' \) \
  -mtime "+$retention_days" -delete
