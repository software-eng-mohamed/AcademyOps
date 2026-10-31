#!/usr/bin/env sh
set -eu

[ "${PLG_STAGE34_INTEGRATION_ACK:-}" = disposable-only ] || {
  echo 'Set PLG_STAGE34_INTEGRATION_ACK=disposable-only to run this destructive disposable test' >&2
  exit 2
}

for command_name in age age-keygen docker readlink sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
fixture=$(mktemp -d "/tmp/plg-stage34-backup-restore.XXXXXX")
case "$(readlink -f -- "$fixture")" in
  /tmp/plg-stage34-backup-restore.*) ;;
  *) echo 'Disposable fixture escaped the expected temporary directory' >&2; exit 1 ;;
esac
project="plg_stage34_backup_restore_$(date -u +%Y%m%d%H%M%S)_$$"
export COMPOSE_PROJECT_NAME=$project
compose="$fixture/compose.yml"
runtime="$fixture/runtime.env"
identity="$fixture/identity"
plain="$fixture/restored-source.dump"
target=plg_restore_stage34

cleanup() {
  if [ -f "$compose" ] && [ -f "$runtime" ]; then
    docker compose --env-file "$runtime" -f "$compose" down --volumes --remove-orphans \
      >/dev/null 2>&1 || true
  fi
  case "$(readlink -f -- "$fixture")" in
    /tmp/plg-stage34-backup-restore.*) rm -rf -- "$fixture" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$fixture/scripts"
cp "$script_dir/backup-postgres.sh" "$fixture/scripts/backup-postgres.sh"
cp "$script_dir/restore-postgres.sh" "$fixture/scripts/restore-postgres.sh"
cat > "$runtime" <<'EOF'
POSTGRES_DB=plg_stage34
POSTGRES_USER=stage34_admin
POSTGRES_PASSWORD=stage34_admin_password
POSTGRES_MIGRATE_PASSWORD=stage34_migrate_password
POSTGRES_APP_PASSWORD=stage34_app_password
POSTGRES_EXPORTER_PASSWORD=stage34_monitor_password
EOF
cat > "$compose" <<'EOF'
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"']
      interval: 1s
      timeout: 3s
      retries: 30
    volumes: [stage34-postgres:/var/lib/postgresql/data]
  db-observability-init:
    image: postgres:17-alpine
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_MIGRATE_PASSWORD: ${POSTGRES_MIGRATE_PASSWORD}
      POSTGRES_APP_PASSWORD: ${POSTGRES_APP_PASSWORD}
      POSTGRES_EXPORTER_PASSWORD: ${POSTGRES_EXPORTER_PASSWORD}
    entrypoint: ['true']
    depends_on:
      postgres: { condition: service_healthy }
  backup-tool:
    image: postgres:17-alpine
    profiles: [maintenance]
    user: 70:70
    read_only: true
    tmpfs:
      - /tmp:size=16m,uid=70,gid=70,mode=0700,nosuid,nodev,noexec
      - /work:size=512m,uid=70,gid=70,mode=0700,nosuid,nodev,noexec
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_MIGRATE_PASSWORD: ${POSTGRES_MIGRATE_PASSWORD}
    networks: [default]
volumes:
  stage34-postgres:
EOF

dc() { docker compose --env-file "$runtime" -f "$compose" "$@"; }
dc up -d postgres
attempt=0
until [ "$(dc ps --format json postgres | tr -d '\r\n')" != '' ] && \
  dc exec -T postgres pg_isready -U stage34_admin -d plg_stage34 >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || { echo 'Disposable PostgreSQL did not become ready' >&2; exit 1; }
  sleep 1
done

dc exec -T postgres sh -ceu '
  PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE plg_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '\''stage34_migrate_password'\'';
CREATE ROLE plg_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '\''stage34_app_password'\'';
GRANT CREATE, USAGE ON SCHEMA public TO plg_migrate;
SET ROLE plg_migrate;
CREATE TABLE public.stage34_backup_probe (
  id integer PRIMARY KEY,
  external_code text NOT NULL,
  amount numeric(14,2) NOT NULL,
  payload text NOT NULL
);
INSERT INTO public.stage34_backup_probe (id, external_code, amount, payload)
SELECT value,
       '\''PLG-'\'' || lpad(value::text, 6, '\''0'\''),
       value * 1.25,
       md5(value::text || '\''a'\'') || md5(value::text || '\''b'\'') ||
       md5(value::text || '\''c'\'') || md5(value::text || '\''d'\'') ||
       md5(value::text || '\''e'\'') || md5(value::text || '\''f'\'') ||
       md5(value::text || '\''g'\'') || md5(value::text || '\''h'\'')
FROM generate_series(1, 100000) AS value;
RESET ROLE;
SQL
'

expected=$(dc exec -T postgres sh -ceu '
  PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc \
    "SELECT count(*) || '\''|'\'' || sum(id) || '\''|'\'' || sum(amount) || '\''|'\'' || md5(string_agg(payload, '\'''\'' ORDER BY id)) FROM public.stage34_backup_probe"
')
age-keygen --output "$identity" >/dev/null 2>&1
BACKUP_AGE_RECIPIENT=$(age-keygen -y "$identity")
export BACKUP_AGE_RECIPIENT
backup=$(sh "$fixture/scripts/backup-postgres.sh" --local-only)
[ -z "$(find "$fixture/backups" -mindepth 1 -type f -name '*.dump' -print -quit)" ] || {
  echo 'Backup left a plaintext PostgreSQL archive on host storage' >&2
  exit 1
}
age --decrypt --identity "$identity" --output "$plain" "$backup"
archive_bytes=$(wc -c < "$plain")
[ "$archive_bytes" -gt 1048576 ] || {
  echo "Decrypted archive is too small for the large-stream regression: $archive_bytes" >&2
  exit 1
}
metadata_bytes=$(sed -n 's/^archive_bytes=//p' "$backup.metadata")
metadata_digest=$(sed -n 's/^archive_sha256=//p' "$backup.metadata")
[ "$metadata_bytes" = "$archive_bytes" ] || {
  echo "Archive byte metadata differs: expected=$archive_bytes actual=$metadata_bytes" >&2
  exit 1
}
[ "$metadata_digest" = "$(sha256sum "$plain" | awk '{print $1}')" ] || {
  echo 'Archive digest metadata differs from the complete decrypted archive' >&2
  exit 1
}

BACKUP_AGE_IDENTITY_FILE=$identity
export BACKUP_AGE_IDENTITY_FILE
sh "$fixture/scripts/restore-postgres.sh" "$backup" "$target" --execute >/dev/null
[ -z "$(find "$fixture/backups" -mindepth 1 -type f -name '*.dump' -print -quit)" ] || {
  echo 'Restore left a plaintext PostgreSQL archive on host storage' >&2
  exit 1
}
actual=$(dc exec -T postgres sh -ceu '
  PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$1" -Atqc \
    "SELECT count(*) || '\''|'\'' || sum(id) || '\''|'\'' || sum(amount) || '\''|'\'' || md5(string_agg(payload, '\'''\'' ORDER BY id)) FROM public.stage34_backup_probe"
' -- "$target")
[ "$actual" = "$expected" ] || {
  echo "Restored rows or values differ: expected=$expected actual=$actual" >&2
  exit 1
}
dc exec -T postgres sh -ceu \
  'PGPASSWORD="$POSTGRES_PASSWORD" dropdb -U "$POSTGRES_USER" --force "$1"' -- "$target"

echo "Encrypted PostgreSQL round trip passed: archive_bytes=$archive_bytes rows_and_values=$actual"
