#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - Single VPS Healthcheck Script
# Verifies health and connectivity of every container in the stack
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
vps_dir=$(dirname "$script_dir")
cd "$vps_dir"

failed=0

check() {
  name="$1"
  cmd="$2"
  printf "Checking %-25s ... " "$name"
  if eval "$cmd" >/dev/null 2>&1; then
    printf "\033[32m[PASS]\033[0m\n"
  else
    printf "\033[31m[FAIL]\033[0m\n"
    failed=$((failed + 1))
  fi
}

echo "=== Running Comprehensive Health Checks ==="

check "PostgreSQL 17" \
  "docker compose --env-file runtime.env -f compose.yml exec -T postgres pg_isready -U \$(grep '^POSTGRES_USER=' runtime.env | cut -d= -f2) -d \$(grep '^POSTGRES_DB=' runtime.env | cut -d= -f2)"

check "Redis 7 Ping" \
  "docker compose --env-file runtime.env -f compose.yml exec -T redis sh -c 'REDISCLI_AUTH=\"\$(grep ^REDIS_PASSWORD= runtime.env | cut -d= -f2)\" redis-cli ping | grep -q PONG'"

check "ClamAV Antivirus" \
  "docker compose --env-file runtime.env -f compose.yml exec -T clamav /clamdcheck.sh"

check "WhatsApp OTP Connector" \
  "docker compose --env-file runtime.env -f compose.yml exec -T otp-connector node -e \"fetch('http://127.0.0.1:3002/health/ready').then(r=>process.exit(!r.ok)).catch(()=>process.exit(1))\""

check "API Instance A Ready" \
  "docker compose --env-file runtime.env -f compose.yml exec -T api-a /nodejs/bin/node -e \"fetch('http://127.0.0.1:3001/api/v1/health/ready').then(r=>process.exit(!r.ok)).catch(()=>process.exit(1))\""

check "API Instance B Ready" \
  "docker compose --env-file runtime.env -f compose.yml exec -T api-b /nodejs/bin/node -e \"fetch('http://127.0.0.1:3001/api/v1/health/ready').then(r=>process.exit(!r.ok)).catch(()=>process.exit(1))\""

check "Web Frontend Health" \
  "docker compose --env-file runtime.env -f compose.yml exec -T web /nodejs/bin/node -e \"fetch('http://127.0.0.1:3100/health').then(r=>process.exit(!r.ok)).catch(()=>process.exit(1))\""

check "Caddy Ingress" \
  "docker compose --env-file runtime.env -f compose.yml exec -T caddy wget -q --spider http://127.0.0.1:8080/health"

check "Prometheus Metrics" \
  "docker compose --env-file runtime.env -f compose.yml exec -T prometheus wget -q --spider http://127.0.0.1:9090/-/healthy"

check "Alertmanager Ready" \
  "docker compose --env-file runtime.env -f compose.yml exec -T alertmanager wget -q --spider http://127.0.0.1:9093/-/ready"

check "Grafana Observability" \
  "docker compose --env-file runtime.env -f compose.yml exec -T grafana wget -q --spider http://127.0.0.1:3000/api/health"

check "Loki Log Ingestion" \
  "docker compose --env-file runtime.env -f compose.yml exec -T loki wget -q --spider http://127.0.0.1:3100/ready"

echo "-------------------------------------------"
if [ "$failed" -eq 0 ]; then
  echo "\033[32mALL CHECKS PASSED (12/12)! The stack is 100% operational.\033[0m"
  exit 0
else
  echo "\033[31m$failed check(s) failed. Inspect logs with 'docker compose logs <service>'\033[0m"
  exit 1
fi
