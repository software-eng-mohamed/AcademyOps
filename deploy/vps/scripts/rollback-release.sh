#!/usr/bin/env sh
set -eu

[ "$#" -eq 2 ] && [ "$2" = '--acknowledge-db-not-rolled-back' ] || {
  echo 'Usage: rollback-release.sh RELEASE.manifest --acknowledge-db-not-rolled-back' >&2
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
  release_fail 'image rollback is unsafe for a contract-migration release'
[ "$(deployment_config_sha "$deploy_dir")" = "$(manifest_value "$manifest" DEPLOYMENT_CONFIG_SHA256)" ] || \
  release_fail 'deployment configuration differs from the attested release'

export IMAGE_TAG=$release_tag
cd "$deploy_dir"
dc() {
  docker compose --env-file runtime.env \
    -f compose.yml -f compose.cloudflare.yml -f compose.clamav.yml -f compose.whatsapp.yml -f compose.monitoring.yml "$@"
}
dc up -d --no-build --no-deps api-a
wait_service_healthy api-a
dc up -d --no-build --no-deps api-b
wait_service_healthy api-b
dc up -d --no-build --no-deps otp-connector
wait_service_healthy otp-connector
dc up -d --no-build --no-deps worker web
wait_service_healthy web

origin=$(runtime_value "$runtime_file" PUBLIC_ORIGIN)
for endpoint in /api/v1/health/live /api/v1/health/ready /ar/login; do
  curl --fail --silent --show-error --location \
    --retry 12 --retry-all-errors --retry-delay 5 --max-time 15 \
    "$origin$endpoint" >/dev/null || release_fail "rollback smoke gate failed: $endpoint"
done
persist_runtime_image_tag "$runtime_file" "$release_tag"
echo "Application images rolled back to $release_tag; the database was not rolled back."
