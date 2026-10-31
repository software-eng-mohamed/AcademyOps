#!/usr/bin/env sh
set -eu

[ "$#" -eq 2 ] || {
  echo 'Usage: install-release-bundle.sh RELEASE.manifest IMAGES.tar' >&2
  exit 2
}
manifest=$1
archive=$2
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/release-common.sh"

for release_input in "$manifest" "$manifest.sig" "$manifest.sha256" \
  "$archive" "$archive.sha256" "$archive.sha256.sig"; do
  [ -f "$release_input" ] && [ ! -L "$release_input" ] || \
    release_fail 'every release input must be a regular, non-symlink file'
done
umask 077
staging=$(mktemp -d "${TMPDIR:-/tmp}/plg-release-install.XXXXXX")
mkdir "$staging/manifest" "$staging/archive"
staged_manifest="$staging/manifest/$(basename -- "$manifest")"
staged_archive="$staging/archive/$(basename -- "$archive")"
cleanup() {
  rm -f "$staged_manifest" "$staged_manifest.sig" "$staged_manifest.sha256" \
    "$staged_archive" "$staged_archive.sha256" "$staged_archive.sha256.sig"
  rmdir "$staging/manifest" "$staging/archive" 2>/dev/null || true
  rmdir "$staging" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
cp --no-dereference "$manifest" "$staged_manifest"
cp --no-dereference "$manifest.sig" "$staged_manifest.sig"
cp --no-dereference "$manifest.sha256" "$staged_manifest.sha256"
cp --no-dereference "$archive" "$staged_archive"
cp --no-dereference "$archive.sha256" "$staged_archive.sha256"
cp --no-dereference "$archive.sha256.sig" "$staged_archive.sha256.sig"
manifest=$staged_manifest
archive=$staged_archive

verify_release_manifest "$manifest"
verify_release_signature "$archive.sha256" "$archive.sha256.sig"
verify_sha256_sidecar "$archive" "$archive.sha256"

docker image load --input "$archive" >/dev/null
verify_installed_release_images
trap - EXIT HUP INT TERM
cleanup
echo "Installed checksum-verified release images for $release_tag."
