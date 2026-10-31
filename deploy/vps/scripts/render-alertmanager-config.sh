#!/usr/bin/env sh
set -eu

[ "$#" -le 2 ] || {
  echo 'Usage: render-alertmanager-config.sh [RUNTIME_ENV [OUTPUT_FILE]]' >&2
  exit 2
}
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
env_file=${1:-$deploy_dir/runtime.env}
template="$deploy_dir/alertmanager/alertmanager.yml"
target=${2:-$deploy_dir/runtime/alertmanager.yml}

[ -f "$env_file" ] && [ ! -L "$env_file" ] || {
  echo 'runtime.env must be a regular, non-symlink file' >&2
  exit 1
}
webhook_url=$(awk -F= '
  $1 == "ALERT_WEBHOOK_URL" { count += 1; sub(/^[^=]*=/, ""); value = $0 }
  END { if (count != 1) exit 2; print value }
' "$env_file") || {
  echo 'ALERT_WEBHOOK_URL must occur exactly once' >&2
  exit 1
}
case "$webhook_url" in
  https://?*) ;;
  http://plg-alert-receiver-*:*/*)
    [ "${PLG_ALLOW_LOCAL_ALERT_RECEIVER:-}" = local-container ] || {
      echo 'HTTP alert receivers are allowed only for the disposable local delivery test' >&2
      exit 1
    }
    ;;
  *) echo 'ALERT_WEBHOOK_URL must be an HTTPS URL' >&2; exit 1 ;;
esac
compact_url=$(printf '%s' "$webhook_url" | tr -d '[:space:]') || {
  echo 'Could not validate ALERT_WEBHOOK_URL whitespace' >&2
  exit 1
}
[ "$compact_url" = "$webhook_url" ] || {
  echo 'ALERT_WEBHOOK_URL contains whitespace' >&2
  exit 1
}
case "$webhook_url" in
  *"'"* | *'"'* | *"\\"* | *'#'*)
    echo 'ALERT_WEBHOOK_URL contains unsafe characters' >&2
    exit 1
    ;;
esac

umask 077
mkdir -p "$(dirname -- "$target")"
[ ! -L "$target" ] || { echo 'Alertmanager output must not be a symlink' >&2; exit 1; }
temp="$target.tmp.$$"
cleanup() { rm -f "$temp"; }
trap cleanup EXIT HUP INT TERM
awk -v replacement="$webhook_url" '
  {
    marker = "__ALERT_WEBHOOK_URL__"
    position = index($0, marker)
    if (position == 0) { print; next }
    print substr($0, 1, position - 1) replacement substr($0, position + length(marker))
    found += 1
  }
  END { if (found != 1) exit 2 }
' "$template" > "$temp" || {
  echo 'Could not render the Alertmanager configuration exactly once' >&2
  exit 1
}
chmod 600 "$temp"
if [ "$(id -u)" -eq 0 ]; then
  chown 65534:65534 "$temp"
  chmod 400 "$temp"
fi
mv "$temp" "$target"
trap - EXIT HUP INT TERM
