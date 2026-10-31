#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - VPS 3 Healthcheck Script
# Verifies PostgreSQL, Redis, Exporters, and Log Shipper
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
vps_dir=$(dirname "$script_dir")
cd "$vps_dir"

failed=0

check() {
  name="$1"
  cmd="$2"
  printf "Checking %-32s ... " "$name"
  if eval "$cmd" >/dev/null 2>&1; then
    printf "\033[32m[PASS]\033[0m\n"
  else
    printf "\033[31m[FAIL]\033[0m\n"
    failed=$((failed + 1))
  fi
}

echo "=== VPS 3 (Database & Redis) Health Checks ==="

check "PostgreSQL 17 Database" \
  "docker compose --env-file runtime.env -f compose.yml exec -T postgres pg_isready -U \$(grep '^POSTGRES_USER=' runtime.env | cut -d= -f2) -d \$(grep '^POSTGRES_DB=' runtime.env | cut -d= -f2)"

check "Redis 7.4 Ping" \
  "docker compose --env-file runtime.env -f compose.yml exec -T redis sh -c 'REDISCLI_AUTH=\"\$(grep ^REDIS_PASSWORD= runtime.env | cut -d= -f2)\" redis-cli ping | grep -q PONG'"

check "PostgreSQL Exporter" \
  "docker compose --env-file runtime.env -f compose.yml exec -T postgres-exporter wget -q --spider http://127.0.0.1:9187/metrics"

check "Redis Exporter" \
  "docker compose --env-file runtime.env -f compose.yml exec -T redis-exporter wget -q --spider http://127.0.0.1:9121/metrics"

check "Grafana Alloy Forwarder" \
  "docker compose --env-file runtime.env -f compose.yml ps alloy --filter 'status=running' | grep -q alloy"

check "Node Exporter" \
  "docker compose --env-file runtime.env -f compose.yml ps node-exporter --filter 'status=running' | grep -q node-exporter"

echo "------------------------------------------------------"
if [ "$failed" -eq 0 ]; then
  echo "\033[32mALL VPS 3 CHECKS PASSED (6/6)! Services are fully healthy.\033[0m"
  exit 0
else
  echo "\033[31m$failed check(s) failed on VPS 3. Check container logs.\033[0m"
  exit 1
fi
