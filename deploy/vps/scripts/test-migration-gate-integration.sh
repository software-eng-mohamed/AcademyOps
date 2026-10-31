#!/usr/bin/env sh
set -eu

[ "${PLG_STAGE34_INTEGRATION_ACK:-}" = disposable-only ] || {
  echo 'Set PLG_STAGE34_INTEGRATION_ACK=disposable-only to run this destructive disposable test' >&2
  exit 2
}
for command_name in cut docker grep readlink; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_script="$script_dir/deploy-release.sh"
grep -Fq 'if ! dc run --rm migrate; then' "$deploy_script" || {
  echo 'deploy-release.sh is not wired to the checked one-shot migration gate' >&2
  exit 1
}
if grep -Fq 'dc up --no-build migrate' "$deploy_script"; then
  echo 'deploy-release.sh still contains the detached-status migration command' >&2
  exit 1
fi
migration_line=$(grep -n -F 'if ! dc run --rm migrate; then' "$deploy_script" | cut -d: -f1)
first_api_line=$(grep -n -F 'dc up -d --no-build --no-deps api-a' "$deploy_script" | cut -d: -f1)
[ -n "$migration_line" ] && [ -n "$first_api_line" ] && [ "$migration_line" -lt "$first_api_line" ] || {
  echo 'New API startup is not ordered after the checked migration gate' >&2
  exit 1
}

fixture=$(mktemp -d "/tmp/plg-stage34-migration-gate.XXXXXX")
case "$(readlink -f -- "$fixture")" in
  /tmp/plg-stage34-migration-gate.*) ;;
  *) echo 'Disposable fixture escaped the expected temporary directory' >&2; exit 1 ;;
esac
project="plg_stage34_migration_gate_$(date -u +%Y%m%d%H%M%S)_$$"
export COMPOSE_PROJECT_NAME=$project
compose="$fixture/compose.yml"
cleanup() {
  [ ! -f "$compose" ] || \
    docker compose -f "$compose" down --volumes --remove-orphans >/dev/null 2>&1 || true
  case "$(readlink -f -- "$fixture")" in
    /tmp/plg-stage34-migration-gate.*) rm -rf -- "$fixture" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

cat > "$compose" <<'EOF'
services:
  old-api:
    image: postgres:17-alpine
    command: [sh, -ceu, 'touch /tmp/old-api-ready; exec tail -f /dev/null']
  migrate:
    image: postgres:17-alpine
    command: [sh, -ceu, 'exit 23']
  new-api:
    image: postgres:17-alpine
    command: [sh, -ceu, 'touch /tmp/new-api-started; exec tail -f /dev/null']
EOF

dc() { docker compose -f "$compose" "$@"; }
dc up -d old-api
old_before=$(dc ps -q old-api)
[ -n "$old_before" ] || { echo 'Old API fixture did not start' >&2; exit 1; }
docker exec "$old_before" test -f /tmp/old-api-ready

set +e
dc run --rm migrate >/dev/null 2>&1
migration_exit=$?
set -e
[ "$migration_exit" -eq 23 ] || {
  echo "Migration exit was not propagated: $migration_exit" >&2
  exit 1
}
old_after=$(dc ps -q old-api)
[ "$old_after" = "$old_before" ] || { echo 'Old API container changed' >&2; exit 1; }
[ "$(docker inspect "$old_after" --format '{{.State.Running}}')" = true ] || {
  echo 'Old API container stopped after migration failure' >&2
  exit 1
}
docker exec "$old_after" test -f /tmp/old-api-ready
[ -z "$(dc ps -q new-api)" ] || { echo 'New API started after migration failure' >&2; exit 1; }
[ -z "$(dc ps -a -q migrate)" ] || { echo 'One-shot migration container was not removed' >&2; exit 1; }

echo "Failed migration gate passed: exit=$migration_exit old_api=$old_after new_api=not-started"
