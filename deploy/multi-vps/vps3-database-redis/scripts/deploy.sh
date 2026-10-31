#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - VPS 3 Deployment Script
# Provisions PostgreSQL 17, Redis 7.4, and Observability Exporters
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

echo "=== 2. Starting PostgreSQL & Redis Services ==="
docker compose --env-file runtime.env -f compose.yml up -d postgres redis

echo "Waiting for PostgreSQL and Redis to become healthy..."
for i in $(seq 1 30); do
  pg_status=$(docker compose --env-file runtime.env -f compose.yml ps postgres --format '{{.Health}}' 2>/dev/null || echo "")
  redis_status=$(docker compose --env-file runtime.env -f compose.yml ps redis --format '{{.Health}}' 2>/dev/null || echo "")
  if [ "$pg_status" = "healthy" ] && [ "$redis_status" = "healthy" ]; then
    echo "PostgreSQL and Redis are healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: PostgreSQL or Redis failed to become healthy within 30 seconds." >&2
    docker compose --env-file runtime.env -f compose.yml logs postgres redis
    exit 1
  fi
  sleep 1
done

echo "=== 3. Initializing Database Observability & Scraper Roles ==="
docker compose --env-file runtime.env -f compose.yml up db-observability-init

echo "=== 4. Starting Exporters and Log Shipper ==="
docker compose --env-file runtime.env -f compose.yml up -d postgres-exporter redis-exporter alloy node-exporter

echo "=== 5. Running VPS 3 Local Healthchecks ==="
sh scripts/healthcheck.sh

echo "==================================================================="
echo " AcademyOps VPS 3 (Database & Redis) Deployed Successfully!"
echo " PostgreSQL Private: ${VPS3_PRIVATE_IP:-10.10.0.3}:5432"
echo " Redis Private:      ${VPS3_PRIVATE_IP:-10.10.0.3}:6379"
echo " Postgres Exporter:  ${VPS3_PRIVATE_IP:-10.10.0.3}:9187"
echo " Redis Exporter:     ${VPS3_PRIVATE_IP:-10.10.0.3}:9121"
echo "==================================================================="
