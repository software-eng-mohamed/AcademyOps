#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - VPS 1 Healthcheck Script
# Verifies health of Caddy, Web Frontend, Prometheus, Alertmanager, Grafana, Loki
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
vps_dir=$(dirname "$script_dir")
cd "$vps_dir"

failed=0

check() {
  name="$1"
  cmd="$2"
  printf "Checking %-28s ... " "$name"
  if eval "$cmd" >/dev/null 2>&1; then
    printf "\033[32m[PASS]\033[0m\n"
  else
    printf "\033[31m[FAIL]\033[0m\n"
    failed=$((failed + 1))
  fi
}

echo "=== VPS 1 (Frontend & Observability) Health Checks ==="

check "Web Frontend Health" \
  "docker compose --env-file runtime.env -f compose.yml exec -T web /nodejs/bin/node -e \"fetch('http://127.0.0.1:3100/health').then(r=>process.exit(!r.ok)).catch(()=>process.exit(1))\""

check "Caddy Ingress Health" \
  "docker compose --env-file runtime.env -f compose.yml exec -T caddy wget -q --spider http://127.0.0.1:8080/health"

check "Prometheus Core" \
  "docker compose --env-file runtime.env -f compose.yml exec -T prometheus wget -q --spider http://127.0.0.1:9090/-/healthy"

check "Alertmanager Ready" \
  "docker compose --env-file runtime.env -f compose.yml exec -T alertmanager wget -q --spider http://127.0.0.1:9093/-/ready"

check "Grafana API" \
  "docker compose --env-file runtime.env -f compose.yml exec -T grafana wget -q --spider http://127.0.0.1:3000/api/health"

check "Loki Ingestion Status" \
  "docker compose --env-file runtime.env -f compose.yml exec -T loki wget -q --spider http://127.0.0.1:3100/ready"

echo "------------------------------------------------------"
if [ "$failed" -eq 0 ]; then
  echo "\033[32mALL VPS 1 CHECKS PASSED (6/6)! Services are fully healthy.\033[0m"
  exit 0
else
  echo "\033[31m$failed check(s) failed on VPS 1. Check container logs.\033[0m"
  exit 1
fi
