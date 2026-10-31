#!/usr/bin/env sh
set -eu

usage() {
  echo 'Usage: backup-postgres.sh [--local-only]' >&2
  exit 2
}

mode=${1:-remote}
case "$mode" in
  remote) ;;
  --local-only) mode=local ;;
  *) usage ;;
esac

: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT to an offline age recipient}"
case "$BACKUP_AGE_RECIPIENT" in
  age1* | age-plugin-*) ;;
  *) echo 'BACKUP_AGE_RECIPIENT is not a supported age recipient' >&2; exit 2 ;;
esac
if [ "$mode" = remote ]; then
  : "${BACKUP_RCLONE_DESTINATION:?Set an off-host rclone remote:path destination}"
  retention_days=${BACKUP_LOCAL_RETENTION_DAYS:-7}
  case "$retention_days" in '' | *[!0-9]*) echo 'BACKUP_LOCAL_RETENTION_DAYS must be numeric' >&2; exit 2 ;; esac
  [ "$retention_days" -ge 1 ] && [ "$retention_days" -le 30 ] || {
    echo 'BACKUP_LOCAL_RETENTION_DAYS must be between 1 and 30' >&2
    exit 2
  }
  case "$BACKUP_RCLONE_DESTINATION" in
    *:*) ;;
    *) echo 'BACKUP_RCLONE_DESTINATION must be an rclone remote:path' >&2; exit 2 ;;
  esac
fi

for command_name in age docker mkfifo readlink sha256sum tee wc; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done
if [ "$mode" = remote ]; then
  command -v rclone >/dev/null 2>&1 || {
    echo 'Required command is unavailable: rclone' >&2
    exit 1
  }
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
backup_dir="$deploy_dir/backups"
[ ! -L "$backup_dir" ] || { echo 'Backup directory must not be a symlink' >&2; exit 1; }
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
base="plg-$timestamp"
encrypted="$backup_dir/$base.dump.age"
encrypted_partial="$encrypted.partial"
checksum="$encrypted.sha256"
metadata="$encrypted.metadata"
[ ! -e "$encrypted" ] && [ ! -e "$checksum" ] && [ ! -e "$metadata" ] || {
  echo 'A backup already exists for this timestamp' >&2
  exit 1
}

[ -f "$deploy_dir/runtime.env" ] || {
  echo 'runtime.env is missing' >&2
  exit 1
}

umask 077
mkdir -p "$backup_dir"
[ -d "$backup_dir" ] && [ "$(readlink -f -- "$backup_dir")" = "$deploy_dir/backups" ] || {
  echo 'Backup directory escaped the deployment directory' >&2
  exit 1
}
work_dir=$(mktemp -d "$backup_dir/.$base.XXXXXX")
source_pipe="$work_dir/source"
encryption_pipe="$work_dir/encryption"
digest_pipe="$work_dir/digest"
size_pipe="$work_dir/size"
digest_result="$work_dir/digest.result"
size_result="$work_dir/size.result"
remote_verification="$work_dir/remote.dump.age"
mkfifo "$source_pipe" "$encryption_pipe" "$digest_pipe" "$size_pipe"
dump_pid=''
fanout_pid=''
digest_pid=''
size_pid=''
cleanup() {
  [ -z "$dump_pid" ] || kill "$dump_pid" >/dev/null 2>&1 || true
  [ -z "$fanout_pid" ] || kill "$fanout_pid" >/dev/null 2>&1 || true
  [ -z "$digest_pid" ] || kill "$digest_pid" >/dev/null 2>&1 || true
  [ -z "$size_pid" ] || kill "$size_pid" >/dev/null 2>&1 || true
  rm -f "$source_pipe" "$encryption_pipe" "$digest_pipe" "$size_pipe" \
    "$digest_result" "$size_result" "$remote_verification" \
    "$encrypted_partial" "$checksum.partial" "$metadata.partial"
  rmdir "$work_dir" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
cd "$deploy_dir"
dc() { docker compose --env-file runtime.env -f compose.yml "$@"; }

sha256sum < "$digest_pipe" > "$digest_result" &
digest_pid=$!
wc -c < "$size_pipe" > "$size_result" &
size_pid=$!
dc run --rm --no-deps -T -e POSTGRES_MIGRATE_PASSWORD= \
  --entrypoint /bin/sh backup-tool -ceu '
  umask 077
  archive=/work/archive.dump
  if ! PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --format=custom --compress=6 --no-owner --no-privileges \
    --exclude-extension=btree_gist --exclude-extension=pg_trgm \
    --exclude-extension=pg_stat_statements --file="$archive"; then
    exit 91
  fi
  if ! pg_restore --list "$archive" >/dev/null; then exit 92; fi
  cat "$archive"
' \
  > "$source_pipe" &
dump_pid=$!
tee --output-error=warn-nopipe "$digest_pipe" "$size_pipe" \
  < "$source_pipe" > "$encryption_pipe" &
fanout_pid=$!
if ! age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" \
  --output "$encrypted_partial" < "$encryption_pipe"; then
  echo 'Database dump encryption failed' >&2
  exit 1
fi
wait "$fanout_pid" || { echo 'Could not consume the complete PostgreSQL dump' >&2; exit 1; }
fanout_pid=''
if wait "$dump_pid"; then
  :
else
  dump_status=$?
  case "$dump_status" in
    91) echo 'PostgreSQL dump failed' >&2 ;;
    92) echo 'PostgreSQL archive validation failed' >&2 ;;
    *) echo 'PostgreSQL dump or archive validation failed' >&2 ;;
  esac
  exit 1
fi
dump_pid=''
wait "$digest_pid" || { echo 'Could not checksum PostgreSQL dump' >&2; exit 1; }
digest_pid=''
wait "$size_pid" || { echo 'Could not measure PostgreSQL dump' >&2; exit 1; }
size_pid=''
IFS= read -r archive_digest_line < "$digest_result" || {
  echo 'Could not read the PostgreSQL dump checksum' >&2
  exit 1
}
archive_digest=${archive_digest_line%% *}
IFS= read -r archive_bytes < "$size_result" || {
  echo 'Could not read the PostgreSQL dump size' >&2
  exit 1
}
case "$archive_bytes" in '' | *[!0-9]*) echo 'PostgreSQL dump size is invalid' >&2; exit 1 ;; esac
[ "$archive_bytes" -gt 0 ] || { echo 'PostgreSQL dump is empty' >&2; exit 1; }
rm -f "$source_pipe" "$encryption_pipe" "$digest_pipe" "$size_pipe" \
  "$digest_result" "$size_result"

digest_line=$(sha256sum "$encrypted_partial") || { echo 'Could not checksum encrypted backup' >&2; exit 1; }
digest=${digest_line%% *}
printf '%s  %s\n' "$digest" "$(basename "$encrypted")" > "$checksum.partial"
mv "$encrypted_partial" "$encrypted"
mv "$checksum.partial" "$checksum"
(cd "$backup_dir" && sha256sum --check --status "$(basename "$checksum")") || {
  echo 'Encrypted backup checksum verification failed' >&2
  exit 1
}

database_raw=$(dc exec -T postgres printenv POSTGRES_DB) || {
  echo 'Could not read the configured database name' >&2
  exit 1
}
database=$(printf '%s' "$database_raw" | tr -d '\r') || {
  echo 'Could not normalize the configured database name' >&2
  exit 1
}
case "$database" in
  '' | *[!A-Za-z0-9_]*) echo 'Configured database name is unsafe' >&2; exit 1 ;;
esac
source_sha=$(git -C "$deploy_dir/../.." rev-parse --verify HEAD 2>/dev/null || printf unknown)
cat > "$metadata.partial" <<EOF
format=plg-postgres-age-v1
created_utc=$timestamp
database=$database
source_git_sha=$source_sha
archive_bytes=$archive_bytes
archive_sha256=$archive_digest
encrypted_sha256=$digest
EOF
mv "$metadata.partial" "$metadata"

if [ "$mode" = remote ]; then
  remote_root=${BACKUP_RCLONE_DESTINATION%/}
  remote_backup="$remote_root/$(basename "$encrypted")"
  rclone copyto "$encrypted" "$remote_backup" --no-traverse || {
    echo 'Off-host backup upload failed' >&2
    exit 1
  }
  rclone copyto "$remote_backup" "$remote_verification" --no-traverse || {
    echo 'Off-host backup verification download failed' >&2
    exit 1
  }
  remote_digest_line=$(sha256sum "$remote_verification") || {
    echo 'Could not checksum the off-host verification copy' >&2
    exit 1
  }
  remote_digest=${remote_digest_line%% *}
  [ "$remote_digest" = "$digest" ] || {
    echo 'Off-host checksum verification failed' >&2
    exit 1
  }
  rclone copyto "$checksum" "$remote_backup.sha256" --no-traverse || {
    echo 'Off-host checksum upload failed' >&2
    exit 1
  }
  rclone copyto "$metadata" "$remote_backup.metadata" --no-traverse || {
    echo 'Off-host metadata upload failed' >&2
    exit 1
  }
  sh "$script_dir/prune-local-backups.sh" "$retention_days" || {
    echo 'Local backup retention failed' >&2
    exit 1
  }
fi

rm -f "$remote_verification"
rmdir "$work_dir"
trap - EXIT HUP INT TERM
printf '%s\n' "$encrypted"
