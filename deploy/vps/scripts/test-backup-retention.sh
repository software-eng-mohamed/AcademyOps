#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/plg-retention-test.XXXXXX")
case "$work_dir" in "${TMPDIR:-/tmp}"/plg-retention-test.*) ;; *) exit 1 ;; esac
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT HUP INT TERM

fixture="$work_dir/deploy/vps"
mkdir -p "$fixture/scripts" "$fixture/backups" "$work_dir/outside"
cp "$script_dir/prune-local-backups.sh" "$fixture/scripts/prune-local-backups.sh"
old_base="$fixture/backups/plg-20000101T000000Z.dump.age"
new_base="$fixture/backups/plg-20990101T000000Z.dump.age"
outside="$work_dir/outside/do-not-delete"
printf old > "$old_base"
printf old > "$old_base.sha256"
printf old > "$old_base.metadata"
printf new > "$new_base"
printf keep > "$fixture/backups/unrelated.dump.age"
printf outside > "$outside"
ln -s "$outside" "$fixture/backups/plg-20000102T000000Z.dump.age"
touch -t 200001010000 "$old_base" "$old_base.sha256" "$old_base.metadata" \
  "$fixture/backups/unrelated.dump.age"

sh "$fixture/scripts/prune-local-backups.sh" 7
[ ! -e "$old_base" ] && [ ! -e "$old_base.sha256" ] && [ ! -e "$old_base.metadata" ]
[ -f "$new_base" ] && [ -f "$fixture/backups/unrelated.dump.age" ]
[ -L "$fixture/backups/plg-20000102T000000Z.dump.age" ] && [ -f "$outside" ]

rm "$fixture/backups/plg-20000102T000000Z.dump.age" "$new_base" "$fixture/backups/unrelated.dump.age"
rmdir "$fixture/backups"
ln -s "$work_dir/outside" "$fixture/backups"
if sh "$fixture/scripts/prune-local-backups.sh" 7 >/dev/null 2>&1; then
  echo 'Symlinked backup directory was not rejected' >&2
  exit 1
fi
[ -f "$outside" ]
echo 'Local backup retention confinement tests passed.'
