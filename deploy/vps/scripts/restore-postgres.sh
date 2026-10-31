#!/usr/bin/env sh
set -eu
LC_ALL=C
export LC_ALL

usage() {
  echo 'Usage: restore-postgres.sh BACKUP.dump.age NEW_DATABASE [--execute|--drill]' >&2
  exit 2
}

[ "$#" -ge 2 ] && [ "$#" -le 3 ] || usage
backup=$1
target_db=$2
mode=${3:-validate}
case "$mode" in validate | --execute | --drill) ;; *) usage ;; esac
case "$target_db" in
  plg_restore_*) ;;
  *) echo 'NEW_DATABASE must start with plg_restore_' >&2; exit 2 ;;
esac
target_suffix=${target_db#plg_restore_}
[ -n "$target_suffix" ] && [ "${#target_db}" -le 63 ] || {
  echo 'NEW_DATABASE must have a non-empty suffix and be at most 63 characters' >&2
  exit 2
}
case "$target_suffix" in
  *[!A-Za-z0-9_]*) echo 'NEW_DATABASE may contain only ASCII letters, digits, and underscores' >&2; exit 2 ;;
esac
: "${BACKUP_AGE_IDENTITY_FILE:?Set BACKUP_AGE_IDENTITY_FILE outside the repository}"
[ -r "$BACKUP_AGE_IDENTITY_FILE" ] || {
  echo 'BACKUP_AGE_IDENTITY_FILE is not readable' >&2
  exit 2
}
for command_name in age docker mkfifo readlink sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  }
done

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
backup_dir="$deploy_dir/backups"
[ -f "$backup" ] || { echo 'Backup file does not exist' >&2; exit 2; }
backup_dir=$(readlink -f "$backup_dir")
backup_path=$(readlink -f "$backup")
case "$backup_path" in
  "$backup_dir"/*.dump.age) ;;
  *) echo 'Backup must be a .dump.age file inside deploy/vps/backups' >&2; exit 2 ;;
esac
checksum="$backup_path.sha256"
[ -f "$checksum" ] || { echo 'Backup checksum file is missing' >&2; exit 2; }
[ -f "$deploy_dir/runtime.env" ] || { echo 'runtime.env is missing' >&2; exit 1; }

umask 077
work_dir=$(mktemp -d "$backup_dir/.restore-stream.XXXXXX")
plain_pipe="$work_dir/plain"
mkfifo "$plain_pipe"
created=false
decrypt_pid=''
cd "$deploy_dir"
dc() { docker compose --env-file runtime.env -f compose.yml "$@"; }
cleanup() {
  [ -z "$decrypt_pid" ] || kill "$decrypt_pid" >/dev/null 2>&1 || true
  rm -f "$plain_pipe"
  rmdir "$work_dir" 2>/dev/null || true
  if [ "$mode" = '--drill' ] && [ "$created" = true ]; then
    dc exec -T postgres sh -ceu \
      'PGPASSWORD="$POSTGRES_PASSWORD" dropdb -U "$POSTGRES_USER" --force --if-exists "$1"' -- "$target_db" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT HUP INT TERM

[ "$(wc -l < "$checksum")" -eq 1 ] || { echo 'Backup checksum is malformed' >&2; exit 1; }
expected_digest=$(awk 'NF == 2 { print $1 }' "$checksum")
recorded_name=$(awk 'NF == 2 { sub(/^\*/, "", $2); print $2 }' "$checksum")
[ "${#expected_digest}" -eq 64 ] || { echo 'Backup checksum is malformed' >&2; exit 1; }
case "$expected_digest" in *[!0-9a-f]*) echo 'Backup checksum is malformed' >&2; exit 1 ;; esac
[ "$recorded_name" = "$(basename "$backup_path")" ] || {
  echo 'Backup checksum filename differs' >&2
  exit 1
}
actual_digest=$(sha256sum "$backup_path" | awk '{print $1}')
[ "$actual_digest" = "$expected_digest" ] || {
  echo 'Encrypted backup checksum verification failed' >&2
  exit 1
}
age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" "$backup_path" > "$plain_pipe" &
decrypt_pid=$!
if ! dc run --rm --no-deps -T -e POSTGRES_PASSWORD= -e POSTGRES_MIGRATE_PASSWORD= \
  --entrypoint /bin/sh backup-tool -ceu '
  umask 077
  archive=/work/archive.dump
  cat > "$archive"
  pg_restore --list "$archive" >/dev/null
' < "$plain_pipe"; then
  echo 'PostgreSQL archive validation failed' >&2
  exit 1
fi
wait "$decrypt_pid" || { echo 'Backup decryption failed' >&2; exit 1; }
decrypt_pid=''
echo 'Backup checksum, encryption, and archive validation succeeded.'
[ "$mode" != validate ] || {
  rm -f "$plain_pipe"
  rmdir "$work_dir"
  trap - EXIT HUP INT TERM
  exit 0
}

production_db=$(dc exec -T postgres printenv POSTGRES_DB | tr -d '\r')
[ "$target_db" != "$production_db" ] || {
  echo 'Refusing to restore over the configured production database' >&2
  exit 1
}
if ! dc exec -T postgres sh -ceu \
  'PGPASSWORD="$POSTGRES_PASSWORD" createdb -U "$POSTGRES_USER" --owner=plg_migrate "$1"' -- "$target_db"; then
  echo 'Target database already exists or could not be created; refusing to continue' >&2
  exit 1
fi
created=true
dc exec -T postgres sh -ceu '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 <<SQL
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SQL
' -- "$target_db"
age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" "$backup_path" > "$plain_pipe" &
decrypt_pid=$!
if ! dc run --rm --no-deps -T -e POSTGRES_PASSWORD= \
  --entrypoint /bin/sh backup-tool -ceu '
  umask 077
  archive=/work/archive.dump
  cat > "$archive"
  PGPASSWORD="$POSTGRES_MIGRATE_PASSWORD" exec pg_restore -h postgres -U plg_migrate -d "$1" \
    --exit-on-error --no-owner --no-privileges "$archive"
' -- "$target_db" < "$plain_pipe"; then
  echo 'Restore failed; drill databases are removed automatically.' >&2
  exit 1
fi
wait "$decrypt_pid" || { echo 'Backup decryption failed during restore' >&2; exit 1; }
decrypt_pid=''

probe="__plg_restore_probe_$(date -u +%s)_$$"
case "$probe" in *[!a-z0-9_]*) echo 'Internal probe name is unsafe' >&2; exit 1 ;; esac
dc exec -T postgres sh -ceu '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -v target_db="$1" -v probe="$2" <<SQL
ALTER DATABASE :"target_db" OWNER TO plg_migrate;
ALTER SCHEMA public OWNER TO plg_migrate;
GRANT CONNECT ON DATABASE :"target_db" TO plg_app;
GRANT USAGE ON SCHEMA public TO plg_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO plg_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO plg_app;
ALTER DEFAULT PRIVILEGES FOR ROLE plg_migrate IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plg_app;
ALTER DEFAULT PRIVILEGES FOR ROLE plg_migrate IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO plg_app;
ALTER DEFAULT PRIVILEGES FOR ROLE plg_migrate IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO plg_app;
DO \$ownership\$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class AS object
    JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
    LEFT JOIN pg_depend AS dependency
      ON dependency.classid = \$sql\$pg_class\$sql\$::regclass
      AND dependency.objid = object.oid
      AND dependency.deptype = \$sql\$e\$sql\$
    WHERE namespace.nspname = \$sql\$public\$sql\$
      AND object.relkind IN (\$sql\$r\$sql\$, \$sql\$p\$sql\$, \$sql\$S\$sql\$, \$sql\$v\$sql\$, \$sql\$m\$sql\$)
      AND dependency.objid IS NULL
      AND object.relowner <> \$sql\$plg_migrate\$sql\$::regrole
  ) THEN
    RAISE EXCEPTION \$sql\$restored application relation is not owned by plg_migrate\$sql\$;
  END IF;
END
\$ownership\$;
SET ROLE plg_migrate;
CREATE TABLE public.:"probe" (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, value text NOT NULL);
RESET ROLE;
SQL
' -- "$target_db" "$probe"

dc run --rm --no-deps --entrypoint /bin/sh db-observability-init -ceu '
  export PGPASSWORD="$POSTGRES_APP_PASSWORD"
  test "$(psql -h postgres -U plg_app -d "$1" -Atqc "SELECT rolsuper FROM pg_roles WHERE rolname = current_user")" = f
  psql -h postgres -U plg_app -d "$1" -v ON_ERROR_STOP=1 -v probe="$2" <<SQL
BEGIN;
INSERT INTO public.:"probe"(value) VALUES (\$sql\$restore-drill\$sql\$);
UPDATE public.:"probe" SET value = \$sql\$verified\$sql\$ WHERE value = \$sql\$restore-drill\$sql\$;
SELECT value FROM public.:"probe" WHERE value = \$sql\$verified\$sql\$;
DELETE FROM public.:"probe" WHERE value = \$sql\$verified\$sql\$;
ROLLBACK;
SQL
' -- "$target_db" "$probe" >/dev/null

dc exec -T postgres sh -ceu '
  PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -v probe="$2" <<SQL
SET ROLE plg_migrate;
DROP TABLE public.:"probe";
SQL
' -- "$target_db" "$probe"
echo "Restore and non-superuser application CRUD verification succeeded: $target_db"

if [ "$mode" = '--drill' ]; then
  dc exec -T postgres sh -ceu \
    'PGPASSWORD="$POSTGRES_PASSWORD" dropdb -U "$POSTGRES_USER" --force "$1"' -- "$target_db"
  created=false
  echo 'Disposable restore drill database removed.'
fi

trap - EXIT HUP INT TERM
rm -f "$plain_pipe"
rmdir "$work_dir"
