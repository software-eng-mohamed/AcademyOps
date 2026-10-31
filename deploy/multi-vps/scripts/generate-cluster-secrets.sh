#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - Multi-VPS Cluster Secret Generator
# Generates cryptographic keys and synchronized runtime.env files for VPS 1, 2, 3
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
multi_vps_dir=$(dirname "$script_dir")

vps1_env="$multi_vps_dir/vps1-frontend-monitoring/runtime.env"
vps2_env="$multi_vps_dir/vps2-backend-worker/runtime.env"
vps3_env="$multi_vps_dir/vps3-database-redis/runtime.env"

if [ -f "$vps1_env" ] || [ -f "$vps2_env" ] || [ -f "$vps3_env" ]; then
  echo "WARNING: One or more runtime.env files already exist!"
  printf "Do you want to overwrite all cluster secrets? (y/N): "
  read -r answer
  case "$answer" in
    [yY][eE][sS]|[yY]) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

rand_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

rand_b64() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$1"
  else
    head -c "$1" /dev/urandom | base64 | tr -d '\n'
  fi
}

echo "=== 1. Generating High-Entropy Cryptographic Secrets ==="

PG_PASSWORD=$(rand_hex 32)
PG_APP_PASSWORD=$(rand_hex 32)
PG_MIGRATE_PASSWORD=$(rand_hex 32)
PG_EXPORTER_PASSWORD=$(rand_hex 32)
REDIS_PASSWORD=$(rand_hex 32)

SESSION_PEPPER=$(rand_hex 32)
QR_HMAC_SECRET=$(rand_hex 32)
FILE_SIGNING_SECRET=$(rand_hex 32)
MFA_ENCRYPTION_KEY=$(rand_hex 32)
MFA_RECOVERY_PEPPER=$(rand_hex 32)
PASSWORD_RESET_PEPPER=$(rand_hex 32)
PHONE_OTP_PEPPER=$(rand_hex 32)
ACTION_TOKEN_ENCRYPTION_KEY=$(rand_hex 32)
OTP_CONNECTOR_INTERNAL_TOKEN=$(rand_hex 32)
LEGACY_ARCHIVE_KEY=$(rand_hex 32)
METRICS_TOKEN=$(rand_hex 32)

GRAFANA_ADMIN_PASSWORD=$(rand_hex 16)
WHATSAPP_KEY=$(rand_b64 32)
PAYMOB_KEY=$(rand_b64 32)

echo "=== 2. Creating VPS 1 Runtime Environment ==="
sed \
  -e "s/METRICS_TOKEN=GENERATE_64_HEX_CHARS/METRICS_TOKEN=$METRICS_TOKEN/" \
  -e "s/GRAFANA_ADMIN_PASSWORD=GENERATE_STRONG_PASSWORD/GRAFANA_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD/" \
  "$multi_vps_dir/vps1-frontend-monitoring/runtime.env.example" > "$vps1_env"
chmod 600 "$vps1_env"
echo "Created: $vps1_env (mode 600)"

echo "=== 3. Creating VPS 2 Runtime Environment ==="
sed \
  -e "s/GENERATE_APP_PASSWORD/$PG_APP_PASSWORD/g" \
  -e "s/GENERATE_MIGRATE_PASSWORD/$PG_MIGRATE_PASSWORD/g" \
  -e "s/GENERATE_REDIS_PASSWORD/$REDIS_PASSWORD/g" \
  -e "s/METRICS_TOKEN=GENERATE_METRICS_TOKEN/METRICS_TOKEN=$METRICS_TOKEN/" \
  -e "s/ACTION_TOKEN_ENCRYPTION_KEY=GENERATE_64_HEX_CHARS/ACTION_TOKEN_ENCRYPTION_KEY=$ACTION_TOKEN_ENCRYPTION_KEY/" \
  -e "s/SESSION_PEPPER=GENERATE_64_HEX_CHARS/SESSION_PEPPER=$SESSION_PEPPER/" \
  -e "s/QR_HMAC_SECRET=GENERATE_64_HEX_CHARS/QR_HMAC_SECRET=$QR_HMAC_SECRET/" \
  -e "s/FILE_SIGNING_SECRET=GENERATE_64_HEX_CHARS/FILE_SIGNING_SECRET=$FILE_SIGNING_SECRET/" \
  -e "s/MFA_ENCRYPTION_KEY=GENERATE_64_HEX_CHARS/MFA_ENCRYPTION_KEY=$MFA_ENCRYPTION_KEY/" \
  -e "s/MFA_RECOVERY_PEPPER=GENERATE_64_HEX_CHARS/MFA_RECOVERY_PEPPER=$MFA_RECOVERY_PEPPER/" \
  -e "s/PASSWORD_RESET_PEPPER=GENERATE_64_HEX_CHARS/PASSWORD_RESET_PEPPER=$PASSWORD_RESET_PEPPER/" \
  -e "s/PHONE_OTP_PEPPER=GENERATE_64_HEX_CHARS/PHONE_OTP_PEPPER=$PHONE_OTP_PEPPER/" \
  -e "s/OTP_CONNECTOR_INTERNAL_TOKEN=GENERATE_64_HEX_CHARS/OTP_CONNECTOR_INTERNAL_TOKEN=$OTP_CONNECTOR_INTERNAL_TOKEN/" \
  -e "s/LEGACY_ARCHIVE_KEY=GENERATE_64_HEX_CHARS/LEGACY_ARCHIVE_KEY=$LEGACY_ARCHIVE_KEY/" \
  -e "s|WHATSAPP_AUTH_ENCRYPTION_KEY=GENERATE_32_BYTES_BASE64|WHATSAPP_AUTH_ENCRYPTION_KEY=$WHATSAPP_KEY|" \
  -e "s|PAYMOB_CHECKOUT_ENCRYPTION_KEY=GENERATE_32_BYTES_BASE64|PAYMOB_CHECKOUT_ENCRYPTION_KEY=$PAYMOB_KEY|" \
  "$multi_vps_dir/vps2-backend-worker/runtime.env.example" > "$vps2_env"
chmod 600 "$vps2_env"
echo "Created: $vps2_env (mode 600)"

echo "=== 4. Creating VPS 3 Runtime Environment ==="
sed \
  -e "s/POSTGRES_PASSWORD=GENERATE_ADMIN_PASSWORD/POSTGRES_PASSWORD=$PG_PASSWORD/" \
  -e "s/POSTGRES_APP_PASSWORD=GENERATE_APP_PASSWORD/POSTGRES_APP_PASSWORD=$PG_APP_PASSWORD/" \
  -e "s/POSTGRES_MIGRATE_PASSWORD=GENERATE_MIGRATE_PASSWORD/POSTGRES_MIGRATE_PASSWORD=$PG_MIGRATE_PASSWORD/" \
  -e "s/POSTGRES_EXPORTER_PASSWORD=GENERATE_EXPORTER_PASSWORD/POSTGRES_EXPORTER_PASSWORD=$PG_EXPORTER_PASSWORD/" \
  -e "s/REDIS_PASSWORD=GENERATE_REDIS_PASSWORD/REDIS_PASSWORD=$REDIS_PASSWORD/" \
  "$multi_vps_dir/vps3-database-redis/runtime.env.example" > "$vps3_env"
chmod 600 "$vps3_env"
echo "Created: $vps3_env (mode 600)"

echo "==================================================================="
echo " Cluster secrets generated with 100% synchronization!"
echo " Retrieve the Grafana administrator password from vps1-frontend-monitoring/runtime.env."
echo "==================================================================="
