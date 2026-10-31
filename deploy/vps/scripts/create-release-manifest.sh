#!/usr/bin/env sh
set -eu

usage() {
  echo 'Usage: create-release-manifest.sh OUTPUT_FILE [expand-only|contract]' >&2
  exit 2
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
output=$1
policy=${2:-expand-only}
case "$policy" in expand-only | contract) ;; *) usage ;; esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
repo_dir=$(CDPATH= cd -- "$deploy_dir/../.." && pwd)
. "$script_dir/release-common.sh"
for command_name in docker git sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || release_fail "$command_name is unavailable"
done

source_sha=${SOURCE_GIT_SHA:-$(git -C "$repo_dir" rev-parse --verify HEAD)}
[ "${#source_sha}" -eq 40 ] || release_fail 'a full Git SHA is required'
case "$source_sha" in *[!0-9a-f]*) release_fail 'Git SHA must be lowercase hexadecimal' ;; esac
git -C "$repo_dir" cat-file -e "$source_sha^{commit}" || release_fail 'Git SHA is not in this repository'
if [ "$source_sha" = "$(git -C "$repo_dir" rev-parse HEAD)" ]; then
  [ -z "$(git -C "$repo_dir" status --porcelain --untracked-files=normal)" ] || \
    release_fail 'refusing to attest images from a dirty source tree'
fi

backend_id=$(docker image inspect "plg-backend:$source_sha" --format '{{.Id}}' 2>/dev/null) || \
  release_fail 'tagged backend image is missing'
web_id=$(docker image inspect "plg-web:$source_sha" --format '{{.Id}}' 2>/dev/null) || \
  release_fail 'tagged web image is missing'
otp_connector_id=$(docker image inspect "plg-otp-connector:$source_sha" --format '{{.Id}}' 2>/dev/null) || \
  release_fail 'tagged OTP connector image is missing'
backend_revision=$(docker image inspect "plg-backend:$source_sha" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
web_revision=$(docker image inspect "plg-web:$source_sha" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
otp_connector_revision=$(docker image inspect "plg-otp-connector:$source_sha" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
[ "$backend_revision" = "$source_sha" ] || release_fail 'backend image revision label is missing or incorrect'
[ "$web_revision" = "$source_sha" ] || release_fail 'web image revision label is missing or incorrect'
[ "$otp_connector_revision" = "$source_sha" ] || release_fail 'OTP connector image revision label is missing or incorrect'
config_sha=$(deployment_config_sha "$deploy_dir")
migrations_tree=$(git -C "$repo_dir" rev-parse "$source_sha:apps/api/prisma/migrations")
created=$(date -u +%Y-%m-%dT%H:%M:%SZ)

umask 077
mkdir -p "$(dirname -- "$output")"
temp="$output.partial"
trap 'rm -f "$temp" "$output.sha256.partial"' EXIT HUP INT TERM
cat > "$temp" <<EOF
FORMAT=plg-release-v1
SOURCE_GIT_SHA=$source_sha
IMAGE_TAG=$source_sha
BACKEND_IMAGE=plg-backend:$source_sha
BACKEND_IMAGE_ID=$backend_id
WEB_IMAGE=plg-web:$source_sha
WEB_IMAGE_ID=$web_id
OTP_CONNECTOR_IMAGE=plg-otp-connector:$source_sha
OTP_CONNECTOR_IMAGE_ID=$otp_connector_id
MIGRATIONS_TREE=$migrations_tree
MIGRATION_POLICY=$policy
DEPLOYMENT_CONFIG_SHA256=$config_sha
CREATED_UTC=$created
EOF
chmod 644 "$temp"
mv "$temp" "$output"
(cd "$(dirname -- "$output")" && sha256sum "$(basename "$output")") > "$output.sha256.partial"
mv "$output.sha256.partial" "$output.sha256"
sign_release_file "$output"
trap - EXIT HUP INT TERM
printf '%s\n' "$output"
