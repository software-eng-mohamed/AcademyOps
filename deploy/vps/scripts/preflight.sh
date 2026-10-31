#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
env_file="$deploy_dir/runtime.env"
token_file="$deploy_dir/runtime/cloudflared-token"

fail() {
  echo "preflight: $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail 'docker is not installed'
docker compose version >/dev/null 2>&1 || fail 'docker compose v2 is not available'
[ -f "$env_file" ] || fail 'copy runtime.env.example to runtime.env and fill it first'
[ ! -L "$env_file" ] || fail 'runtime.env must not be a symlink'
[ -f "$token_file" ] || fail 'runtime/cloudflared-token is required for production'
[ ! -L "$token_file" ] || fail 'runtime/cloudflared-token must not be a symlink'

case "$(stat -c '%a' "$env_file")" in
  600 | 400) ;;
  *) fail 'runtime.env permissions must be 600 or 400' ;;
esac

case "$(stat -c '%a' "$token_file")" in
  600 | 400) ;;
  *) fail 'runtime/cloudflared-token permissions must be 600 or 400' ;;
esac
[ "$(stat -c '%u:%g' "$token_file")" = '65532:65532' ] || \
  fail 'runtime/cloudflared-token must be owned by 65532:65532'

grep -Eq '^eyJ[A-Za-z0-9._-]+$' "$token_file" || fail 'cloudflared token has an invalid format'
[ "$(wc -l < "$token_file")" -le 1 ] || fail 'cloudflared token must contain one line'

if grep -q 'SET_ME' "$env_file"; then
  fail 'runtime.env still contains SET_ME placeholders'
fi

cd "$deploy_dir"
sh scripts/validate-runtime-env.sh
sh scripts/render-prometheus-config.sh
sh scripts/render-alertmanager-config.sh
docker compose --env-file runtime.env \
  -f compose.yml -f compose.cloudflare.yml -f compose.clamav.yml -f compose.whatsapp.yml -f compose.monitoring.yml \
  config --quiet
docker compose --env-file runtime.env \
  -f compose.yml -f compose.synthetic.yml -f compose.clamav.yml -f compose.whatsapp.yml -f compose.monitoring.yml \
  config --quiet
docker compose --env-file runtime.env -f compose.yml run --rm --no-deps caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file runtime.env -f compose.yml -f compose.synthetic.yml \
  run --rm --no-deps caddy caddy validate \
  --config /etc/caddy/Caddyfile.synthetic --adapter caddyfile
docker compose --env-file runtime.env -f compose.yml -f compose.monitoring.yml \
  run --rm --no-deps --entrypoint /bin/promtool prometheus \
  check config /etc/prometheus/prometheus.yml
docker compose --env-file runtime.env -f compose.yml -f compose.monitoring.yml \
  run --rm --no-deps --entrypoint /bin/amtool alertmanager \
  check-config /etc/alertmanager/alertmanager.yml

memory_kib=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
[ "$memory_kib" -ge 15728640 ] || fail 'this combined stack requires a host with at least 16 GiB RAM'
if [ "$(df -Pk "$deploy_dir" | awk 'NR==2 {print $4}')" -lt 20971520 ]; then
  fail 'less than 20 GiB is free on the deployment filesystem'
fi

echo 'Preflight passed. This validates configuration, not external DNS, SMTP, R2, or Paymob.'
