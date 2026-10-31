#!/usr/bin/env sh
set -eu
LC_ALL=C
export LC_ALL

mode=${1:-install}
case "$mode" in install | --verify-only) ;; *) echo 'Usage: install-backup-schedule.sh [--verify-only]' >&2; exit 2 ;; esac
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
deploy_user=${DEPLOY_USER:-plgdeploy}
env_file=/etc/plg/backup.env

fail() { echo "backup schedule: $*" >&2; exit 1; }
case "$deploy_dir" in /*) ;; *) fail 'deployment directory must be absolute' ;; esac
case "$deploy_dir" in *[!A-Za-z0-9_./-]*) fail 'deployment directory contains unsafe characters' ;; esac
case "$deploy_user" in '' | *[!a-z0-9_-]*) fail 'DEPLOY_USER is invalid' ;; esac
[ -f "$script_dir/backup-postgres.sh" ] && [ ! -L "$script_dir/backup-postgres.sh" ] || \
  fail 'backup-postgres.sh must be a regular, non-symlink file'

for command_name in flock getent install readlink sed stat systemctl systemd-analyze; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is unavailable"
done
getent passwd "$deploy_user" >/dev/null || fail 'deployment user does not exist'

stage=$(mktemp -d "${TMPDIR:-/tmp}/plg-backup-units.XXXXXX")
service="$stage/plg-postgres-backup.service"
timer="$stage/plg-postgres-backup.timer"
docker_stub="$stage/docker.service"
cleanup() {
  rm -f "$service" "$timer" "$docker_stub"
  rmdir "$stage" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
sed -e "s|@DEPLOY_DIR@|$deploy_dir|g" -e "s|@DEPLOY_USER@|$deploy_user|g" \
  "$deploy_dir/systemd/plg-postgres-backup.service.in" > "$service"
cp "$deploy_dir/systemd/plg-postgres-backup.timer" "$timer"
chmod 0644 "$service" "$timer"
if [ "$mode" = '--verify-only' ]; then
  printf '%s\n' '[Service]' 'Type=oneshot' 'ExecStart=/bin/true' > "$docker_stub"
  chmod 0644 "$docker_stub"
  systemd-analyze verify "$docker_stub" "$service" "$timer"
else
  systemd-analyze verify "$service" "$timer"
fi
[ "$mode" = install ] || {
  echo 'Backup systemd units passed static verification.'
  exit 0
}

[ "$(id -u)" -eq 0 ] || fail 'installation must run as root'
[ -f "$env_file" ] && [ ! -L "$env_file" ] || fail '/etc/plg/backup.env is missing or unsafe'
[ "$(readlink -f -- "$env_file")" = "$env_file" ] || fail 'backup environment path must not traverse symlinks'
[ -d /etc/plg ] && [ ! -L /etc/plg ] && [ "$(stat -c '%u' -- /etc/plg)" = 0 ] || \
  fail '/etc/plg must be a root-owned, non-symlink directory'
env_parent_mode=$(stat -c '%a' -- /etc/plg) || fail 'could not inspect /etc/plg'
case "$env_parent_mode" in '' | *[!0-7]*) fail '/etc/plg mode is invalid' ;; esac
[ $((0$env_parent_mode & 022)) -eq 0 ] || fail '/etc/plg must not be group/world writable'
[ "$(stat -c '%u' -- "$env_file")" = 0 ] || fail 'backup environment must be owned by root'
[ "$(stat -c '%a' -- "$env_file")" = 600 ] || fail 'backup environment must have mode 0600'
[ "$(grep -Ec '^BACKUP_AGE_RECIPIENT=' "$env_file")" -eq 1 ] || fail 'age recipient must occur exactly once'
[ "$(grep -Ec '^BACKUP_RCLONE_DESTINATION=' "$env_file")" -eq 1 ] || \
  fail 'rclone destination must occur exactly once'
[ "$(grep -Ec '^BACKUP_LOCAL_RETENTION_DAYS=' "$env_file")" -eq 1 ] || \
  fail 'local retention must occur exactly once'
[ "$(grep -Ec '^BACKUP_AGE_RECIPIENT=.+$' "$env_file")" -eq 1 ] || \
  fail 'backup environment must contain one age recipient'
[ "$(grep -Ec '^BACKUP_RCLONE_DESTINATION=.+:.+$' "$env_file")" -eq 1 ] || \
  fail 'backup environment must contain one remote:path destination'
[ "$(grep -Ec '^BACKUP_LOCAL_RETENTION_DAYS=[0-9]+$' "$env_file")" -eq 1 ] || \
  fail 'backup environment must contain one numeric local retention period'
retention_days=$(awk -F= '$1 == "BACKUP_LOCAL_RETENTION_DAYS" { print $2 }' "$env_file")
[ "$retention_days" -ge 1 ] && [ "$retention_days" -le 30 ] || \
  fail 'BACKUP_LOCAL_RETENTION_DAYS must be between 1 and 30'
grep -Eq '^[[:space:]]*BACKUP_AGE_IDENTITY_FILE=' "$env_file" && \
  fail 'never place the age private identity on the VPS'
id -nG "$deploy_user" | tr ' ' '\n' | grep -qx docker || fail 'deployment user must belong to the docker group'

install -d -o "$deploy_user" -g "$deploy_user" -m 0700 "$deploy_dir/backups"
install -d -o "$deploy_user" -g "$deploy_user" -m 0755 /var/lib/plg-backup
install -o root -g root -m 0644 "$service" /etc/systemd/system/plg-postgres-backup.service
install -o root -g root -m 0644 "$timer" /etc/systemd/system/plg-postgres-backup.timer
systemctl daemon-reload
systemctl enable --now plg-postgres-backup.timer
systemctl is-enabled --quiet plg-postgres-backup.timer
systemctl is-active --quiet plg-postgres-backup.timer
echo 'Daily encrypted off-host backup timer installed and active.'
