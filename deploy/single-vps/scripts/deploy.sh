#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - Single VPS Production Deployment Script
# Safely provisions the single VPS stack with healthchecks and zero data loss
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
vps_dir=$(dirname "$script_dir")
cd "$vps_dir"

env_file="$vps_dir/runtime.env"
if [ ! -f "$env_file" ]; then
  echo "ERROR: runtime.env not found!" >&2
  echo "Run 'sh scripts/generate-secrets.sh' first, then configure your domain." >&2
  exit 1
fi

echo "=== 1. Validating Runtime Environment ==="
# Verify permissions
perms=$(stat -c '%a' "$env_file" 2>/dev/null || stat -f '%A' "$env_file" 2>/dev/null || echo "unknown")
case "$perms" in
  *00|*400|*600) ;;
  *) echo "Securing runtime.env permissions to 600..."; chmod 600 "$env_file" ;;
esac

echo "=== 2. Building / Pulling Services ==="
docker compose --env-file runtime.env -f compose.yml build

echo "=== 3. Starting State Services (PostgreSQL & Redis) ==="
docker compose --env-file runtime.env -f compose.yml up -d postgres redis

echo "Waiting for database and redis healthchecks..."
for i in $(seq 1 30); do
  pg_status=$(docker compose --env-file runtime.env -f compose.yml ps postgres --format '{{.Health}}' 2>/dev/null || echo "")
  redis_status=$(docker compose --env-file runtime.env -f compose.yml ps redis --format '{{.Health}}' 2>/dev/null || echo "")
  if [ "$pg_status" = "healthy" ] && [ "$redis_status" = "healthy" ]; then
    echo "PostgreSQL and Redis are healthy."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Database or Redis failed to become healthy in 30 seconds." >&2
    docker compose --env-file runtime.env -f compose.yml logs postgres redis
    exit 1
  fi
  sleep 1
done

echo "=== 4. Running DB Observability Init & Migrations ==="
docker compose --env-file runtime.env -f compose.yml up db-observability-init migrate

echo "=== 5. Starting All Application & Observability Services ==="
docker compose --env-file runtime.env -f compose.yml up -d

echo "=== 6. Performing Rolling Healthchecks ==="
sh scripts/healthcheck.sh

echo "==================================================================="
echo " AcademyOps Single-VPS Stack Deployed Successfully!"
echo " Public Origin: $(grep '^PUBLIC_ORIGIN=' runtime.env | cut -d= -f2)"
echo " Grafana: http://127.0.0.1:3300 (Tunnel via ssh -L 3300:127.0.0.1:3300)"
echo " Prometheus: http://127.0.0.1:9090 (Tunnel via ssh -L 9090:127.0.0.1:9090)"
echo "==================================================================="
