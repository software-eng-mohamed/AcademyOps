#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - VPS 2 Healthcheck Script
# Verifies health of API instances, Worker, WhatsApp OTP Connector, and ClamAV
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

echo "=== VPS 2 (Backend, Worker, OTP) Health Checks ==="

check "ClamAV Antivirus Daemon" \
  "docker compose --env-file runtime.env -f compose.yml exec -T clamav /clamdcheck.sh"

check "WhatsApp OTP Connector Ready" \
  "docker compose --env-file runtime.env -f compose.yml exec -T otp-connector node -e \"fetch('http://127.0.0.1:3002/health/ready').then(r=>process.exit(!r.ok)).catch(()=>process.exit(1))\""

check "API Instance A Ready" \
  "docker compose --env-file runtime.env -f compose.yml exec -T api-a /nodejs/bin/node -e \"fetch('http://127.0.0.1:3001/api/v1/health/ready').then(r=>process.exit(!r.ok)).catch(()=>process.exit(1))\""

check "API Instance B Ready" \
  "docker compose --env-file runtime.env -f compose.yml exec -T api-b /nodejs/bin/node -e \"fetch('http://127.0.0.1:3001/api/v1/health/ready').then(r=>process.exit(!r.ok)).catch(()=>process.exit(1))\""

check "BullMQ Worker Container" \
  "docker compose --env-file runtime.env -f compose.yml ps worker --filter 'status=running' | grep -q worker"

check "Grafana Alloy Forwarder" \
  "docker compose --env-file runtime.env -f compose.yml ps alloy --filter 'status=running' | grep -q alloy"

echo "------------------------------------------------------"
if [ "$failed" -eq 0 ]; then
  echo "\033[32mALL VPS 2 CHECKS PASSED (6/6)! Services are fully healthy.\033[0m"
  exit 0
else
  echo "\033[31m$failed check(s) failed on VPS 2. Check container logs.\033[0m"
  exit 1
fi
