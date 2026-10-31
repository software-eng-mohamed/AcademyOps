#!/usr/bin/env sh

release_fail() {
  echo "release: $*" >&2
  exit 1
}

release_signature_namespace=plg-release
release_signer_identity=plg-release

file_mode_is_private() {
  checked_mode=$(stat -c '%a' -- "$1") || return 1
  case "$checked_mode" in '' | *[!0-7]*) return 1 ;; esac
  [ $((0$checked_mode & 077)) -eq 0 ]
}

sign_release_file() {
  signed_subject=$1
  signing_key=${RELEASE_SIGNING_KEY_FILE:-}
  [ -f "$signed_subject" ] && [ ! -L "$signed_subject" ] || \
    release_fail 'release signing subject must be a regular, non-symlink file'
  [ -n "$signing_key" ] && [ -f "$signing_key" ] && [ ! -L "$signing_key" ] && [ -r "$signing_key" ] || \
    release_fail 'RELEASE_SIGNING_KEY_FILE must be a readable, non-symlink private key'
  file_mode_is_private "$signing_key" || release_fail 'release signing private key must have mode 0600 or stricter'
  command -v ssh-keygen >/dev/null 2>&1 || release_fail 'ssh-keygen is unavailable'

  signature_input="$signed_subject.signing.$$"
  signature_partial="$signed_subject.sig.partial"
  rm -f "$signature_input" "$signature_input.sig" "$signature_partial"
  cp "$signed_subject" "$signature_input"
  if ! ssh-keygen -Y sign -q -f "$signing_key" -n "$release_signature_namespace" "$signature_input" >/dev/null; then
    rm -f "$signature_input" "$signature_input.sig"
    release_fail 'release signature creation failed'
  fi
  mv "$signature_input.sig" "$signature_partial"
  rm -f "$signature_input"
  chmod 644 "$signature_partial"
  mv "$signature_partial" "$signed_subject.sig"
}

verify_release_signature() {
  signed_subject=$1
  signature=$2
  trusted_signers=${RELEASE_ALLOWED_SIGNERS_FILE:-/etc/plg/trusted_release_signers}
  case "$trusted_signers" in /*) ;; *) release_fail 'trusted release signers path must be absolute' ;; esac
  [ -f "$signed_subject" ] && [ ! -L "$signed_subject" ] || \
    release_fail 'signed release file must be a regular, non-symlink file'
  [ -f "$signature" ] && [ ! -L "$signature" ] || release_fail 'release signature is missing or unsafe'
  [ -f "$trusted_signers" ] && [ ! -L "$trusted_signers" ] || \
    release_fail 'trusted release signers file is missing or unsafe'
  [ "$(readlink -f -- "$trusted_signers")" = "$trusted_signers" ] || \
    release_fail 'trusted release signers path must not traverse symlinks'
  trusted_parent=$(dirname -- "$trusted_signers")
  while :; do
    [ -d "$trusted_parent" ] && [ ! -L "$trusted_parent" ] && \
      [ "$(stat -c '%u' -- "$trusted_parent")" = 0 ] || \
      release_fail 'every trusted signer path directory must be root-owned and not a symlink'
    parent_mode=$(stat -c '%a' -- "$trusted_parent") || release_fail 'could not inspect trusted signer directory'
    case "$parent_mode" in '' | *[!0-7]*) release_fail 'trusted signer directory mode is invalid' ;; esac
    [ $((0$parent_mode & 022)) -eq 0 ] || \
      release_fail 'trusted signer path directories must not be group/world writable'
    [ "$trusted_parent" = / ] && break
    trusted_parent=$(dirname -- "$trusted_parent")
  done
  [ "$(stat -c '%u' -- "$trusted_signers")" = 0 ] || \
    release_fail 'trusted release signers file must be owned by root'
  trusted_mode=$(stat -c '%a' -- "$trusted_signers") || release_fail 'could not inspect trusted release signers'
  case "$trusted_mode" in '' | *[!0-7]*) release_fail 'trusted release signers mode is invalid' ;; esac
  [ $((0$trusted_mode & 022)) -eq 0 ] || \
    release_fail 'trusted release signers file must not be group/world writable'
  awk 'NF { if ($1 != "plg-release" || $2 != "ssh-ed25519" || NF < 3) exit 2; count += 1 }
    END { if (count < 1) exit 2 }' "$trusted_signers" || \
    release_fail 'trusted release signers must contain only plg-release Ed25519 identities'
  command -v ssh-keygen >/dev/null 2>&1 || release_fail 'ssh-keygen is unavailable'
  ssh-keygen -Y verify -q -f "$trusted_signers" -I "$release_signer_identity" \
    -n "$release_signature_namespace" -s "$signature" < "$signed_subject" >/dev/null 2>&1 || \
    release_fail 'release signature verification failed'
}

manifest_value() {
  manifest_path=$1
  manifest_key=$2
  awk -F= -v key="$manifest_key" '
    $1 == key { count += 1; sub(/^[^=]*=/, ""); value = $0 }
    END { if (count != 1) exit 2; print value }
  ' "$manifest_path" || release_fail "$manifest_key must occur exactly once"
}

verify_sha256_sidecar() {
  subject=$1
  sidecar=$2
  [ -f "$subject" ] && [ ! -L "$subject" ] || release_fail 'checksummed file does not exist or is unsafe'
  [ -f "$sidecar" ] && [ ! -L "$sidecar" ] || release_fail 'SHA-256 sidecar is missing or unsafe'
  [ "$(wc -l < "$sidecar")" -eq 1 ] || release_fail 'SHA-256 sidecar must contain one line'
  expected=$(awk 'NF == 2 { print $1 }' "$sidecar")
  recorded_name=$(awk 'NF == 2 { sub(/^\*/, "", $2); print $2 }' "$sidecar")
  [ "${#expected}" -eq 64 ] || release_fail 'SHA-256 sidecar digest is invalid'
  case "$expected" in *[!0-9a-f]*) release_fail 'SHA-256 sidecar digest is invalid' ;; esac
  [ "$recorded_name" = "$(basename "$subject")" ] || release_fail 'SHA-256 sidecar filename differs'
  actual=$(sha256sum "$subject" | awk '{print $1}')
  [ "$actual" = "$expected" ] || release_fail 'SHA-256 verification failed'
}

deployment_config_sha() {
  config_root=$1
  (
    cd "$config_root"
    find . -type f \
      ! -path './runtime/*' \
      ! -path './backups/*' \
      ! -name 'runtime.env' \
      -print \
      | LC_ALL=C sort \
      | while IFS= read -r config_file; do sha256sum "$config_file"; done
  ) | sha256sum | awk '{print $1}'
}

verify_release_manifest() {
  manifest=$1
  verify_release_signature "$manifest" "$manifest.sig"
  verify_sha256_sidecar "$manifest" "$manifest.sha256"

  [ "$(manifest_value "$manifest" FORMAT)" = plg-release-v1 ] || \
    release_fail 'unsupported release manifest format'
  release_sha=$(manifest_value "$manifest" SOURCE_GIT_SHA)
  release_tag=$(manifest_value "$manifest" IMAGE_TAG)
  backend_image=$(manifest_value "$manifest" BACKEND_IMAGE)
  backend_id=$(manifest_value "$manifest" BACKEND_IMAGE_ID)
  web_image=$(manifest_value "$manifest" WEB_IMAGE)
  web_id=$(manifest_value "$manifest" WEB_IMAGE_ID)
  otp_connector_image=$(manifest_value "$manifest" OTP_CONNECTOR_IMAGE)
  otp_connector_id=$(manifest_value "$manifest" OTP_CONNECTOR_IMAGE_ID)
  migrations_tree=$(manifest_value "$manifest" MIGRATIONS_TREE)
  migration_policy=$(manifest_value "$manifest" MIGRATION_POLICY)
  config_sha=$(manifest_value "$manifest" DEPLOYMENT_CONFIG_SHA256)
  [ "${#release_sha}" -eq 40 ] || release_fail 'SOURCE_GIT_SHA must be a full Git SHA'
  case "$release_sha" in *[!0-9a-f]*) release_fail 'SOURCE_GIT_SHA must be lowercase hexadecimal' ;; esac
  [ "$release_tag" = "$release_sha" ] || release_fail 'IMAGE_TAG must equal SOURCE_GIT_SHA'
  [ "$backend_image" = "plg-backend:$release_tag" ] || release_fail 'backend image tag is invalid'
  [ "$web_image" = "plg-web:$release_tag" ] || release_fail 'web image tag is invalid'
  [ "$otp_connector_image" = "plg-otp-connector:$release_tag" ] || release_fail 'OTP connector image tag is invalid'
  case "$backend_id" in sha256:[0-9a-f]*) ;; *) release_fail 'backend image ID is invalid' ;; esac
  case "$web_id" in sha256:[0-9a-f]*) ;; *) release_fail 'web image ID is invalid' ;; esac
  case "$otp_connector_id" in sha256:[0-9a-f]*) ;; *) release_fail 'OTP connector image ID is invalid' ;; esac
  [ "${#backend_id}" -eq 71 ] || release_fail 'backend image ID length is invalid'
  [ "${#web_id}" -eq 71 ] || release_fail 'web image ID length is invalid'
  [ "${#otp_connector_id}" -eq 71 ] || release_fail 'OTP connector image ID length is invalid'
  case "${backend_id#sha256:}" in *[!0-9a-f]*) release_fail 'backend image ID is invalid' ;; esac
  case "${web_id#sha256:}" in *[!0-9a-f]*) release_fail 'web image ID is invalid' ;; esac
  case "${otp_connector_id#sha256:}" in *[!0-9a-f]*) release_fail 'OTP connector image ID is invalid' ;; esac
  [ "${#migrations_tree}" -eq 40 ] || release_fail 'migrations tree is invalid'
  [ "${#config_sha}" -eq 64 ] || release_fail 'deployment configuration digest is invalid'
  case "$migrations_tree$config_sha" in *[!0-9a-f]*) release_fail 'manifest digest is invalid' ;; esac
  case "$migration_policy" in expand-only | contract) ;; *) release_fail 'migration policy is invalid' ;; esac
}

wait_service_healthy() {
  service=$1
  attempts=0
  while [ "$attempts" -lt 60 ]; do
    container_id=$(dc ps -q "$service")
    if [ -n "$container_id" ]; then
      health=$(docker inspect "$container_id" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}')
      [ "$health" = healthy ] && return 0
    fi
    attempts=$((attempts + 1))
    sleep 2
  done
  release_fail "$service did not become healthy"
}

verify_installed_release_images() {
  backend_actual=$(docker image inspect "plg-backend:$release_tag" --format '{{.Id}}' 2>/dev/null) || \
    release_fail 'backend release image is not installed'
  web_actual=$(docker image inspect "plg-web:$release_tag" --format '{{.Id}}' 2>/dev/null) || \
    release_fail 'web release image is not installed'
  otp_connector_actual=$(docker image inspect "plg-otp-connector:$release_tag" --format '{{.Id}}' 2>/dev/null) || \
    release_fail 'OTP connector release image is not installed'
  [ "$backend_actual" = "$backend_id" ] || release_fail 'backend image ID differs from manifest'
  [ "$web_actual" = "$web_id" ] || release_fail 'web image ID differs from manifest'
  [ "$otp_connector_actual" = "$otp_connector_id" ] || release_fail 'OTP connector image ID differs from manifest'
  backend_revision=$(docker image inspect "plg-backend:$release_tag" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  web_revision=$(docker image inspect "plg-web:$release_tag" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  otp_connector_revision=$(docker image inspect "plg-otp-connector:$release_tag" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
  [ "$backend_revision" = "$release_sha" ] || release_fail 'backend revision label differs from manifest'
  [ "$web_revision" = "$release_sha" ] || release_fail 'web revision label differs from manifest'
  [ "$otp_connector_revision" = "$release_sha" ] || release_fail 'OTP connector revision label differs from manifest'
}

runtime_value() {
  runtime_file=$1
  runtime_key=$2
  awk -F= -v key="$runtime_key" '
    $1 == key { count += 1; sub(/^[^=]*=/, ""); value = $0 }
    END { if (count != 1) exit 2; print value }
  ' "$runtime_file" || release_fail "$runtime_key must occur exactly once in runtime.env"
}

persist_runtime_image_tag() {
  runtime_file=$1
  new_tag=$2
  temp=$(mktemp "$(dirname -- "$runtime_file")/.runtime.env.XXXXXX")
  awk -F= -v value="$new_tag" '
    BEGIN { count = 0 }
    $1 == "IMAGE_TAG" { print "IMAGE_TAG=" value; count += 1; next }
    { print }
    END { if (count != 1) exit 2 }
  ' "$runtime_file" > "$temp" || {
    rm -f "$temp"
    release_fail 'could not update IMAGE_TAG exactly once'
  }
  chmod 600 "$temp"
  mv "$temp" "$runtime_file"
}
