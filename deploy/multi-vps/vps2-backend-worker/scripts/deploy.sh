#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - VPS 2 Deployment Script
# Provisions NestJS API, BullMQ Worker, WhatsApp OTP Connector, and ClamAV
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
vps_dir=$(dirname "$script_dir")
cd "$vps_dir"

env_file="$vps_dir/runtime.env"
if [ ! -f "$env_file" ]; then
  echo "ERROR: runtime.env not found in $vps_dir!" >&2
  echo "Run 'sh ../scripts/generate-cluster-secrets.sh' or copy runtime.env.example to runtime.env." >&2
  exit 1
fi

echo "=== 1. Validating Runtime Environment ==="
perms=$(stat -c '%a' "$env_file" 2>/dev/null || stat -f '%A' "$env_file" 2>/dev/null || echo "unknown")
case "$perms" in
  *00|*400|*600) ;;
  *) echo "Securing runtime.env permissions to 600..."; chmod 600 "$env_file" ;;
esac

echo "=== 2. Building Application Images ==="
docker compose --env-file runtime.env -f compose.yml build

echo "=== 3. Running Database Migrations against VPS 3 ==="
docker compose --env-file runtime.env -f compose.yml run --rm migrate

echo "=== 4. Starting Background Services & Applications ==="
docker compose --env-file runtime.env -f compose.yml up -d

echo "=== 5. Running VPS 2 Local Healthchecks ==="
sh scripts/healthcheck.sh

echo "==================================================================="
echo " AcademyOps VPS 2 (Backend & Workers) Deployed Successfully!"
echo " API Instance A: ${VPS2_PRIVATE_IP:-10.10.0.2}:3001"
echo " API Instance B: ${VPS2_PRIVATE_IP:-10.10.0.2}:3003"
echo " OTP Connector:  Internal microservice active (port 3002)"
echo " BullMQ Worker:  Active and processing background jobs"
echo "==================================================================="
