#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
env_file="$deploy_dir/runtime.env"
template="$deploy_dir/prometheus/prometheus.yml"
target="$deploy_dir/runtime/prometheus.yml"

[ -f "$env_file" ] || { echo 'runtime.env is required' >&2; exit 1; }
metrics_token=$(awk -F= '$1 == "METRICS_TOKEN" { sub(/^[^=]*=/, ""); print; exit }' "$env_file")
case "$metrics_token" in
  *[!0-9a-fA-F]* | '')
    echo 'METRICS_TOKEN must be a 64-character hexadecimal value' >&2
    exit 1
    ;;
esac
[ "${#metrics_token}" -eq 64 ] || {
  echo 'METRICS_TOKEN must be a 64-character hexadecimal value' >&2
  exit 1
}

umask 077
mkdir -p "$(dirname "$target")"
sed "s/__METRICS_TOKEN__/$metrics_token/g" "$template" >"$target.tmp"
mv "$target.tmp" "$target"
