#!/usr/bin/env sh
set -eu

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || {
  echo 'Usage: create-release-bundle.sh OUTPUT_DIRECTORY [expand-only|contract]' >&2
  exit 2
}
output_dir=$1
policy=${2:-expand-only}
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/../../.." && pwd)
. "$script_dir/release-common.sh"
source_sha=${SOURCE_GIT_SHA:-$(git -C "$repo_dir" rev-parse --verify HEAD)}
manifest="$output_dir/release-$source_sha.manifest"
archive="$output_dir/images-$source_sha.tar"

umask 077
mkdir -p "$output_dir"
sh "$script_dir/create-release-manifest.sh" "$manifest" "$policy" >/dev/null
partial="$archive.partial"
trap 'rm -f "$partial" "$archive.sha256.partial"' EXIT HUP INT TERM
docker image save --output "$partial" "plg-backend:$source_sha" "plg-web:$source_sha" \
  "plg-otp-connector:$source_sha"
mv "$partial" "$archive"
(cd "$output_dir" && sha256sum "$(basename "$archive")") > "$archive.sha256.partial"
mv "$archive.sha256.partial" "$archive.sha256"
sign_release_file "$archive.sha256"
trap - EXIT HUP INT TERM
printf '%s\n%s\n' "$manifest" "$archive"
