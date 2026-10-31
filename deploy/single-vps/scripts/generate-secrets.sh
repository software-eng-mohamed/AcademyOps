#!/usr/bin/env sh
# ==============================================================================
# AcademyOps - Single VPS Secret Generator
# Generates high-entropy cryptographic secrets and populates runtime.env
# ==============================================================================
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
vps_dir=$(dirname "$script_dir")
example_env="$vps_dir/runtime.env.example"
target_env="$vps_dir/runtime.env"

if [ -f "$target_env" ]; then
  echo "WARNING: $target_env already exists!"
  printf "Do you want to overwrite it? (y/N): "
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

echo "Generating independent cryptographic secrets..."

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
METRICS_TOKEN=$(rand_hex 32)
OTP_CONNECTOR_INTERNAL_TOKEN=$(rand_hex 32)
PASSWORD_RESET_PEPPER=$(rand_hex 32)
PHONE_OTP_PEPPER=$(rand_hex 32)
ACTION_TOKEN_ENCRYPTION_KEY=$(rand_hex 32)
LEGACY_ARCHIVE_KEY=$(rand_hex 32)
GRAFANA_ADMIN_PASSWORD=$(rand_hex 16)

WHATSAPP_KEY=$(rand_b64 32)
PAYMOB_KEY=$(rand_b64 32)

sed \
  -e "s/POSTGRES_PASSWORD=GENERATE_64_HEX_CHARS/POSTGRES_PASSWORD=$PG_PASSWORD/" \
  -e "s/POSTGRES_APP_PASSWORD=GENERATE_64_HEX_CHARS/POSTGRES_APP_PASSWORD=$PG_APP_PASSWORD/" \
  -e "s/POSTGRES_MIGRATE_PASSWORD=GENERATE_64_HEX_CHARS/POSTGRES_MIGRATE_PASSWORD=$PG_MIGRATE_PASSWORD/" \
  -e "s/POSTGRES_EXPORTER_PASSWORD=GENERATE_64_HEX_CHARS/POSTGRES_EXPORTER_PASSWORD=$PG_EXPORTER_PASSWORD/" \
  -e "s/API_DATABASE_URL=postgresql:\/\/plg_app:GENERATE_64_HEX_CHARS@postgres:5432\/plg_academy?schema=public&connection_limit=35&pool_timeout=10/API_DATABASE_URL=postgresql:\/\/plg_app:$PG_APP_PASSWORD@postgres:5432\/plg_academy?schema=public\&connection_limit=35\&pool_timeout=10/" \
  -e "s/WORKER_DATABASE_URL=postgresql:\/\/plg_app:GENERATE_64_HEX_CHARS@postgres:5432\/plg_academy?schema=public&connection_limit=10&pool_timeout=10/WORKER_DATABASE_URL=postgresql:\/\/plg_app:$PG_APP_PASSWORD@postgres:5432\/plg_academy?schema=public\&connection_limit=10\&pool_timeout=10/" \
  -e "s/DIRECT_URL=postgresql:\/\/plg_migrate:GENERATE_64_HEX_CHARS@postgres:5432\/plg_academy?schema=public&connection_limit=5&pool_timeout=10/DIRECT_URL=postgresql:\/\/plg_migrate:$PG_MIGRATE_PASSWORD@postgres:5432\/plg_academy?schema=public\&connection_limit=5\&pool_timeout=10/" \
  -e "s/POSTGRES_EXPORTER_DSN=postgresql:\/\/plg_monitor:GENERATE_64_HEX_CHARS@postgres:5432\/plg_academy?sslmode=disable/POSTGRES_EXPORTER_DSN=postgresql:\/\/plg_monitor:$PG_EXPORTER_PASSWORD@postgres:5432\/plg_academy?sslmode=disable/" \
  -e "s/REDIS_PASSWORD=GENERATE_64_HEX_CHARS/REDIS_PASSWORD=$REDIS_PASSWORD/" \
  -e "s/REDIS_URL=redis:\/\/:GENERATE_64_HEX_CHARS@redis:6379\/0/REDIS_URL=redis:\/\/:$REDIS_PASSWORD@redis:6379\/0/" \
  -e "s/SESSION_PEPPER=GENERATE_64_HEX_CHARS/SESSION_PEPPER=$SESSION_PEPPER/" \
  -e "s/QR_HMAC_SECRET=GENERATE_64_HEX_CHARS/QR_HMAC_SECRET=$QR_HMAC_SECRET/" \
  -e "s/FILE_SIGNING_SECRET=GENERATE_64_HEX_CHARS/FILE_SIGNING_SECRET=$FILE_SIGNING_SECRET/" \
  -e "s/MFA_ENCRYPTION_KEY=GENERATE_64_HEX_CHARS/MFA_ENCRYPTION_KEY=$MFA_ENCRYPTION_KEY/" \
  -e "s/MFA_RECOVERY_PEPPER=GENERATE_64_HEX_CHARS/MFA_RECOVERY_PEPPER=$MFA_RECOVERY_PEPPER/" \
  -e "s/METRICS_TOKEN=GENERATE_64_HEX_CHARS/METRICS_TOKEN=$METRICS_TOKEN/" \
  -e "s/OTP_CONNECTOR_INTERNAL_TOKEN=GENERATE_64_HEX_CHARS/OTP_CONNECTOR_INTERNAL_TOKEN=$OTP_CONNECTOR_INTERNAL_TOKEN/" \
  -e "s/PASSWORD_RESET_PEPPER=GENERATE_64_HEX_CHARS/PASSWORD_RESET_PEPPER=$PASSWORD_RESET_PEPPER/" \
  -e "s/PHONE_OTP_PEPPER=GENERATE_64_HEX_CHARS/PHONE_OTP_PEPPER=$PHONE_OTP_PEPPER/" \
  -e "s/ACTION_TOKEN_ENCRYPTION_KEY=GENERATE_64_HEX_CHARS/ACTION_TOKEN_ENCRYPTION_KEY=$ACTION_TOKEN_ENCRYPTION_KEY/" \
  -e "s/LEGACY_ARCHIVE_KEY=GENERATE_64_HEX_CHARS/LEGACY_ARCHIVE_KEY=$LEGACY_ARCHIVE_KEY/" \
  -e "s/GRAFANA_ADMIN_PASSWORD=GENERATE_STRONG_PASSWORD/GRAFANA_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD/" \
  -e "s|WHATSAPP_AUTH_ENCRYPTION_KEY=GENERATE_32_BYTES_BASE64|WHATSAPP_AUTH_ENCRYPTION_KEY=$WHATSAPP_KEY|" \
  -e "s|PAYMOB_CHECKOUT_ENCRYPTION_KEY=GENERATE_32_BYTES_BASE64|PAYMOB_CHECKOUT_ENCRYPTION_KEY=$PAYMOB_KEY|" \
  "$example_env" > "$target_env"

chmod 600 "$target_env"
echo "Generated $target_env with secure permissions (mode 600)."
echo "Remember to edit SITE_ADDRESS, PUBLIC_ORIGIN, and any third-party credentials (Paymob, R2, SMTP)."
