#!/usr/bin/env sh
set -eu

[ "$#" -eq 1 ] || {
  echo 'Usage: deploy-release.sh RELEASE.manifest' >&2
  exit 2
}
manifest=$1
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
runtime_file="$deploy_dir/runtime.env"
. "$script_dir/release-common.sh"
verify_release_manifest "$manifest"
verify_installed_release_images
[ "$migration_policy" = expand-only ] || \
  release_fail 'contract migrations require a separate approved maintenance release'
[ -f "$runtime_file" ] || release_fail 'runtime.env is missing'
[ "$(deployment_config_sha "$deploy_dir")" = "$(manifest_value "$manifest" DEPLOYMENT_CONFIG_SHA256)" ] || \
  release_fail 'deployment configuration differs from the attested release'
state_dir="$deploy_dir/runtime/releases"
if [ -f "$state_dir/current.manifest" ]; then
  verify_release_manifest "$state_dir/current.manifest"
fi

export IMAGE_TAG=$release_tag
cd "$deploy_dir"
sh scripts/preflight.sh
dc() {
  docker compose --env-file runtime.env \
    -f compose.yml -f compose.cloudflare.yml -f compose.clamav.yml -f compose.whatsapp.yml -f compose.monitoring.yml "$@"
}

dc up -d --no-build postgres redis clamav db-observability-init
sh scripts/backup-postgres.sh >/dev/null
if ! dc run --rm migrate; then
  release_fail 'database migration failed; the running API release was left unchanged'
fi
dc up -d --no-build --no-deps api-a
wait_service_healthy api-a
dc up -d --no-build --no-deps api-b
wait_service_healthy api-b
dc up -d --no-build --no-deps otp-connector
wait_service_healthy otp-connector
dc up -d --no-build --no-deps worker web
wait_service_healthy web
dc up -d --no-build --remove-orphans

origin=$(runtime_value "$runtime_file" PUBLIC_ORIGIN)
for endpoint in /api/v1/health/live /api/v1/health/ready /ar/login; do
  curl --fail --silent --show-error --location \
    --retry 12 --retry-all-errors --retry-delay 5 --max-time 15 \
    "$origin$endpoint" >/dev/null || release_fail "smoke gate failed: $endpoint"
done

umask 077
mkdir -p "$state_dir"
if [ -f "$state_dir/current.manifest" ]; then
  cp "$state_dir/current.manifest" "$state_dir/previous.manifest"
  cp "$state_dir/current.manifest.sig" "$state_dir/previous.manifest.sig"
  (cd "$state_dir" && sha256sum previous.manifest) > "$state_dir/previous.manifest.sha256"
fi
cp "$manifest" "$state_dir/current.manifest"
cp "$manifest.sig" "$state_dir/current.manifest.sig"
(cd "$state_dir" && sha256sum current.manifest) > "$state_dir/current.manifest.sha256"
persist_runtime_image_tag "$runtime_file" "$release_tag"
echo "Release $release_tag passed migration and smoke gates."
