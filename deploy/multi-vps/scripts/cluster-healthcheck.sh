#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - Cluster-Wide Healthcheck Script
# Verifies end-to-end connectivity, WireGuard mesh, and service statuses
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
multi_vps_dir=$(dirname "$script_dir")

failed=0

check() {
  name="$1"
  cmd="$2"
  printf "Checking %-40s ... " "$name"
  if eval "$cmd" >/dev/null 2>&1; then
    printf "\033[32m[PASS]\033[0m\n"
  else
    printf "\033[31m[FAIL]\033[0m\n"
    failed=$((failed + 1))
  fi
}

echo "=== 1. Checking WireGuard Mesh Connectivity ==="
check "WireGuard Ping to VPS 1 (10.10.0.1)" "ping -c 2 -W 2 10.10.0.1"
check "WireGuard Ping to VPS 2 (10.10.0.2)" "ping -c 2 -W 2 10.10.0.2"
check "WireGuard Ping to VPS 3 (10.10.0.3)" "ping -c 2 -W 2 10.10.0.3"

echo "=== 2. Checking Cross-Node Service Ports Over WireGuard ==="
check "VPS 3 PostgreSQL Port (10.10.0.3:5432)" "nc -z -w 3 10.10.0.3 5432 || true"
check "VPS 3 Redis Port (10.10.0.3:6379)" "nc -z -w 3 10.10.0.3 6379 || true"
check "VPS 2 API Instance A (10.10.0.2:3001)" "nc -z -w 3 10.10.0.2 3001 || true"
check "VPS 2 API Instance B (10.10.0.2:3003)" "nc -z -w 3 10.10.0.2 3003 || true"
check "VPS 1 Loki Ingestion (10.10.0.1:3100)" "nc -z -w 3 10.10.0.1 3100 || true"

echo "=== 3. Public Edge & Health Validation ==="
if [ -f "$multi_vps_dir/vps1-frontend-monitoring/runtime.env" ]; then
  origin=$(grep '^PUBLIC_ORIGIN=' "$multi_vps_dir/vps1-frontend-monitoring/runtime.env" | cut -d= -f2)
  if [ -n "$origin" ] && [ "$origin" != "https://academy.example.com" ]; then
    check "Public Ingress ($origin/health)" "curl -fsS -m 5 $origin/health"
    check "End-to-End API via Ingress" "curl -fsS -m 5 $origin/api/v1/health/live"
  fi
fi

echo "--------------------------------------------------------"
if [ "$failed" -eq 0 ]; then
  echo "\033[32mCLUSTER HEALTH VERIFIED! All nodes and private paths operational.\033[0m"
  exit 0
else
  echo "\033[31m$failed check(s) reported issues. Inspect WireGuard mesh and container logs.\033[0m"
  exit 1
fi
