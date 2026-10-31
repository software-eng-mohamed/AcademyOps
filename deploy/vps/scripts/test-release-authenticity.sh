#!/usr/bin/env sh
set -eu

[ "$(id -u)" -eq 0 ] || {
  echo 'Run this isolated release-authenticity test as root' >&2
  exit 2
}

for command_name in install ssh-keygen sha256sum stat readlink; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required test command is unavailable: $command_name" >&2
    exit 1
  }
done

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/plg-release-auth-test.XXXXXX")
trust_dir="/etc/plg-release-auth-test.$$"
case "$work_dir" in
  "${TMPDIR:-/tmp}"/plg-release-auth-test.*) ;;
  *) echo 'Unsafe temporary test directory' >&2; exit 1 ;;
esac
trust_suffix=${trust_dir#/etc/plg-release-auth-test.}
case "$trust_suffix" in '' | *[!0-9]*) exit 1 ;; esac
cleanup() {
  rm -f "$trust_dir/trusted_release_signers" "$trust_dir/wrong_trusted_release_signers"
  rmdir "$trust_dir" 2>/dev/null || true
  rm -rf -- "$work_dir"
}
trap cleanup EXIT HUP INT TERM

key="$work_dir/release-key"
wrong_key="$work_dir/wrong-key"
ssh-keygen -q -t ed25519 -N '' -C plg-release-test -f "$key"
ssh-keygen -q -t ed25519 -N '' -C plg-release-wrong -f "$wrong_key"

install -d -o root -g root -m 0755 "$trust_dir"
allowed="$trust_dir/trusted_release_signers"
wrong_allowed="$trust_dir/wrong_trusted_release_signers"
printf 'plg-release %s\n' "$(cat "$key.pub")" > "$allowed"
printf 'plg-release %s\n' "$(cat "$wrong_key.pub")" > "$wrong_allowed"
chmod 600 "$allowed" "$wrong_allowed"

manifest="$work_dir/release.manifest"
archive="$work_dir/images.tar"
cat > "$manifest" <<EOF
FORMAT=plg-release-v1
SOURCE_GIT_SHA=1111111111111111111111111111111111111111
IMAGE_TAG=1111111111111111111111111111111111111111
BACKEND_IMAGE=plg-backend:1111111111111111111111111111111111111111
BACKEND_IMAGE_ID=sha256:2222222222222222222222222222222222222222222222222222222222222222
WEB_IMAGE=plg-web:1111111111111111111111111111111111111111
WEB_IMAGE_ID=sha256:3333333333333333333333333333333333333333333333333333333333333333
OTP_CONNECTOR_IMAGE=plg-otp-connector:1111111111111111111111111111111111111111
OTP_CONNECTOR_IMAGE_ID=sha256:6666666666666666666666666666666666666666666666666666666666666666
MIGRATIONS_TREE=4444444444444444444444444444444444444444
MIGRATION_POLICY=expand-only
DEPLOYMENT_CONFIG_SHA256=5555555555555555555555555555555555555555555555555555555555555555
CREATED_UTC=2026-08-15T00:00:00Z
EOF
printf 'synthetic image archive\n' > "$archive"
(cd "$work_dir" && sha256sum "$(basename "$manifest")") > "$manifest.sha256"
(cd "$work_dir" && sha256sum "$(basename "$archive")") > "$archive.sha256"

RELEASE_SIGNING_KEY_FILE=$key
export RELEASE_SIGNING_KEY_FILE
. "$script_dir/release-common.sh"
sign_release_file "$manifest"
sign_release_file "$archive.sha256"
cp "$manifest" "$manifest.valid"
cp "$manifest.sig" "$manifest.sig.valid"
cp "$archive.sha256.sig" "$archive.sha256.sig.valid"

bin="$work_dir/bin"
invocations="$work_dir/docker-invocations"
mkdir "$bin"
cat > "$bin/docker" <<'EOF'
#!/usr/bin/env sh
printf '%s\n' "$*" >> "$INVOCATION_LOG"
exit 42
EOF
chmod 700 "$bin/docker"
PATH="$bin:$PATH"
INVOCATION_LOG=$invocations
RELEASE_ALLOWED_SIGNERS_FILE=$allowed
export PATH INVOCATION_LOG RELEASE_ALLOWED_SIGNERS_FILE

expect_rejected_without_docker() {
  label=$1
  : > "$invocations"
  if sh "$script_dir/install-release-bundle.sh" "$manifest" "$archive" >/dev/null 2>&1; then
    echo "Expected rejection: $label" >&2
    exit 1
  fi
  [ ! -s "$invocations" ] || {
    echo "Docker was invoked before rejecting: $label" >&2
    exit 1
  }
}

: > "$invocations"
status=0
sh "$script_dir/install-release-bundle.sh" "$manifest" "$archive" >/dev/null 2>&1 || status=$?
[ "$status" -eq 42 ] && grep -qx 'image load --input .*images.tar' "$invocations" || {
  echo 'A valid signed bundle did not reach the controlled Docker stub' >&2
  exit 1
}

rm "$manifest.sig"
expect_rejected_without_docker missing-signature
cp "$manifest.sig.valid" "$manifest.sig"

printf 'TAMPERED=true\n' >> "$manifest"
expect_rejected_without_docker tampered-manifest
cp "$manifest.valid" "$manifest"

cp "$manifest.sig.valid" "$archive.sha256.sig"
expect_rejected_without_docker mixed-signature
cp "$archive.sha256.sig.valid" "$archive.sha256.sig"

RELEASE_ALLOWED_SIGNERS_FILE=$wrong_allowed
export RELEASE_ALLOWED_SIGNERS_FILE
expect_rejected_without_docker wrong-key

unsafe_ancestor_signers="$work_dir/trusted_release_signers"
cp "$allowed" "$unsafe_ancestor_signers"
chmod 600 "$unsafe_ancestor_signers"
RELEASE_ALLOWED_SIGNERS_FILE=$unsafe_ancestor_signers
export RELEASE_ALLOWED_SIGNERS_FILE
expect_rejected_without_docker unsafe-ancestor

echo 'Release authenticity rejection tests passed.'
