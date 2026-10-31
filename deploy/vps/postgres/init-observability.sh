#!/usr/bin/env sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"
: "${POSTGRES_MIGRATE_PASSWORD:?POSTGRES_MIGRATE_PASSWORD is required}"
: "${POSTGRES_EXPORTER_PASSWORD:?POSTGRES_EXPORTER_PASSWORD is required}"

export PGPASSWORD=$POSTGRES_PASSWORD

psql \
  --host postgres \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set ON_ERROR_STOP=1 <<'SQL'
\getenv monitor_password POSTGRES_EXPORTER_PASSWORD
\getenv app_password POSTGRES_APP_PASSWORD
\getenv migrate_password POSTGRES_MIGRATE_PASSWORD
\getenv database_name POSTGRES_DB

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT 'CREATE ROLE plg_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plg_migrate')
\gexec

SELECT format('ALTER ROLE plg_migrate PASSWORD %L', :'migrate_password')
\gexec

SELECT 'CREATE ROLE plg_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plg_app')
\gexec

SELECT format('ALTER ROLE plg_app PASSWORD %L', :'app_password')
\gexec

SELECT 'CREATE ROLE plg_monitor LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plg_monitor')
\gexec

SELECT format('ALTER ROLE plg_monitor PASSWORD %L', :'monitor_password')
\gexec

GRANT pg_monitor TO plg_monitor;
ALTER ROLE plg_monitor SET statement_timeout = '10s';
ALTER ROLE plg_monitor SET default_transaction_read_only = on;

SELECT format('ALTER DATABASE %I OWNER TO plg_migrate', :'database_name')
\gexec
ALTER SCHEMA public OWNER TO plg_migrate;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO plg_app, plg_monitor;
GRANT USAGE ON SCHEMA public TO plg_app, plg_monitor;
ALTER DEFAULT PRIVILEGES FOR ROLE plg_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plg_app;
ALTER DEFAULT PRIVILEGES FOR ROLE plg_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO plg_app;
ALTER DEFAULT PRIVILEGES FOR ROLE plg_migrate IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO plg_app;
ALTER ROLE plg_app SET statement_timeout = '30s';
ALTER ROLE plg_app SET lock_timeout = '10s';
ALTER ROLE plg_app SET idle_in_transaction_session_timeout = '30s';
SQL
