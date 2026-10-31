#!/usr/bin/env sh
set -eu

[ "${PLG_ALERT_TEST_ACK:-}" = local-containers-only ] || {
  echo 'Set PLG_ALERT_TEST_ACK=local-containers-only to run the disposable local delivery test' >&2
  exit 2
}
for command_name in docker readlink; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
fixture=$(mktemp -d /tmp/plg-alertmanager-test.XXXXXX)
case "$(readlink -f -- "$fixture")" in
  /tmp/plg-alertmanager-test.*) ;;
  *) echo 'Alert test fixture escaped /tmp' >&2; exit 1 ;;
esac
suffix="$(date -u +%Y%m%d%H%M%S)-$$"
network="plg-alert-test-$suffix"
receiver="plg-alert-receiver-$suffix"
manager="plg-alertmanager-test-$suffix"

cleanup() {
  case "$manager $receiver $network" in
    plg-alertmanager-test-*' plg-alert-receiver-'*' plg-alert-test-'*)
      docker rm -f "$manager" "$receiver" >/dev/null 2>&1 || true
      docker network rm "$network" >/dev/null 2>&1 || true
      ;;
  esac
  case "$(readlink -f -- "$fixture")" in
    /tmp/plg-alertmanager-test.*) rm -rf -- "$fixture" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

cat > "$fixture/runtime.env" <<EOF
ALERT_WEBHOOK_URL=http://$receiver:8080/alerts
EOF
cat > "$fixture/Caddyfile" <<'EOF'
{
  admin off
}
:8080 {
  log {
    output stdout
    format json
  }
  respond /health 200
  respond /alerts 204
  respond 404
}
EOF
PLG_ALLOW_LOCAL_ALERT_RECEIVER=local-container \
  sh "$script_dir/render-alertmanager-config.sh" \
    "$fixture/runtime.env" "$fixture/alertmanager.yml"
chmod 644 "$fixture/alertmanager.yml" "$fixture/Caddyfile"

docker network create --internal "$network" >/dev/null
MSYS_NO_PATHCONV=1 docker create --name "$receiver" --network "$network" \
  caddy:2.10.2-alpine@sha256:c3d7ee5d2b11f9dc54f947f68a734c84e9c9666c92c88a7f30b9cba5da182adb \
  caddy run --config /etc/caddy/Caddyfile >/dev/null
docker cp "$fixture/Caddyfile" "$receiver:/etc/caddy/Caddyfile" >/dev/null
docker start "$receiver" >/dev/null
MSYS_NO_PATHCONV=1 docker create --name "$manager" --network "$network" \
  prom/alertmanager:v0.28.1@sha256:27c475db5fb156cab31d5c18a4251ac7ed567746a2483ff264516437a39b15ba \
  --config.file=/etc/alertmanager/alertmanager.yml >/dev/null
docker cp "$fixture/alertmanager.yml" "$manager:/etc/alertmanager/alertmanager.yml" >/dev/null
docker start "$manager" >/dev/null

attempt=0
until docker exec "$receiver" wget -qO- "http://$manager:9093/-/ready" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || {
    echo 'Alertmanager did not become ready' >&2
    docker logs "$manager" >&2 || true
    exit 1
  }
  sleep 1
done
docker exec "$receiver" wget -qO- \
  --header='Content-Type: application/json' \
  --post-data='[{"labels":{"alertname":"PostgresOffsiteBackupStale","severity":"critical","instance":"stage5-local-only"},"annotations":{"summary":"local routing test"}}]' \
  "http://$manager:9093/api/v2/alerts" >/dev/null

attempt=0
until docker logs "$receiver" 2>&1 | grep -q '"method":"POST".*"uri":"/alerts"'; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || { echo 'The local webhook did not receive the alert' >&2; exit 1; }
  sleep 1
done
echo 'Local Alertmanager delivery passed: PostgresOffsiteBackupStale -> /alerts (no external receiver)'
