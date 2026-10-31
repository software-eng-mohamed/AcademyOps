#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - VPS 1 Deployment Script
# Provisions Frontend, Caddy Ingress, and Monitoring Hub
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

echo "=== 2. Building Next.js Frontend Image ==="
docker compose --env-file runtime.env -f compose.yml build

echo "=== 3. Starting Monitoring & Frontend Stack ==="
docker compose --env-file runtime.env -f compose.yml up -d

echo "=== 4. Running VPS 1 Local Healthchecks ==="
sh scripts/healthcheck.sh

echo "==================================================================="
echo " AcademyOps VPS 1 (Frontend & Monitoring) Deployed Successfully!"
echo " Public Origin: $(grep '^PUBLIC_ORIGIN=' runtime.env | cut -d= -f2)"
echo " Grafana Local: http://127.0.0.1:3300 (SSH Tunnel: ssh -L 3300:127.0.0.1:3300 user@vps1)"
echo " Prometheus Local: http://127.0.0.1:9090 (SSH Tunnel: ssh -L 9090:127.0.0.1:9090 user@vps1)"
echo "==================================================================="
