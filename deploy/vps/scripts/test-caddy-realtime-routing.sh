#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)

assert_backend_matcher() {
  config=$1
  matcher_count=$(awk '$1 == "@backend" && $2 == "path" { count++ } END { print count + 0 }' "$config")
  [ "$matcher_count" -eq 1 ] || {
    echo "$config must contain exactly one @backend path matcher" >&2
    exit 1
  }

  matcher=$(awk '$1 == "@backend" && $2 == "path" { for (i = 3; i <= NF; i++) printf " %s", $i; print " " }' "$config")
  for required_path in '/api/*' '/socket.io' '/socket.io/*'; do
    case "$matcher" in
      *" $required_path "*) ;;
      *)
        echo "$config backend matcher is missing $required_path" >&2
        exit 1
        ;;
    esac
  done
}

assert_backend_matcher "$deploy_dir/Caddyfile"
assert_backend_matcher "$deploy_dir/Caddyfile.synthetic"
echo 'Caddy realtime routing contract passed.'
