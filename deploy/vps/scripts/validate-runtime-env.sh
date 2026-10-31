#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file="$script_dir/../runtime.env"

fail() {
  echo "runtime validation: $*" >&2
  exit 1
}

value() {
  awk -F= -v key="$1" '
    $1 == key { count += 1; sub(/^[^=]*=/, ""); result = $0 }
    END { if (count != 1) exit 2; print result }
  ' "$env_file" || fail "$1 must occur exactly once"
}

duplicates=$(awk -F= '/^[A-Z][A-Z0-9_]*=/{ seen[$1] += 1 } END { for (key in seen) if (seen[key] > 1) print key }' "$env_file")
[ -z "$duplicates" ] || fail 'duplicate environment keys are forbidden'

site=$(value SITE_ADDRESS)
origin=$(value PUBLIC_ORIGIN)
[ "$origin" = "https://$site" ] || fail 'PUBLIC_ORIGIN must exactly equal https://SITE_ADDRESS'
case "$site" in
  *[!a-zA-Z0-9.-]* | .* | *.) fail 'SITE_ADDRESS must be a plain DNS hostname' ;;
esac

[ "$(value POSTGRES_USER)" = 'plg_bootstrap' ] || fail 'POSTGRES_USER must be plg_bootstrap'
for key in POSTGRES_PASSWORD POSTGRES_APP_PASSWORD POSTGRES_MIGRATE_PASSWORD POSTGRES_EXPORTER_PASSWORD REDIS_PASSWORD; do
  secret=$(value "$key")
  case "$secret" in *[!0-9a-fA-F]* | '') fail "$key must be hexadecimal" ;; esac
  [ "${#secret}" -ge 48 ] || fail "$key must contain at least 48 hexadecimal characters"
done

bootstrap=$(value POSTGRES_PASSWORD)
application=$(value POSTGRES_APP_PASSWORD)
migration=$(value POSTGRES_MIGRATE_PASSWORD)
monitor=$(value POSTGRES_EXPORTER_PASSWORD)
database=$(value POSTGRES_DB)
redis=$(value REDIS_PASSWORD)
otp_connector_token=$(value OTP_CONNECTOR_INTERNAL_TOKEN)
[ "$bootstrap" != "$application" ] || fail 'bootstrap and application passwords must differ'
[ "$bootstrap" != "$migration" ] || fail 'bootstrap and migration passwords must differ'
[ "$bootstrap" != "$monitor" ] || fail 'bootstrap and monitoring passwords must differ'
[ "$application" != "$migration" ] || fail 'application and migration passwords must differ'
[ "$application" != "$monitor" ] || fail 'application and monitoring passwords must differ'
[ "$migration" != "$monitor" ] || fail 'migration and monitoring passwords must differ'

[ "$(value API_DATABASE_URL)" = "postgresql://plg_app:$application@postgres:5432/$database?schema=public&connection_limit=35&pool_timeout=10" ] || fail 'API_DATABASE_URL must use the bounded plg_app pool'
[ "$(value WORKER_DATABASE_URL)" = "postgresql://plg_app:$application@postgres:5432/$database?schema=public&connection_limit=10&pool_timeout=10" ] || fail 'WORKER_DATABASE_URL must use the bounded plg_app pool'
[ "$(value DIRECT_URL)" = "postgresql://plg_migrate:$migration@postgres:5432/$database?schema=public&connection_limit=5&pool_timeout=10" ] || fail 'DIRECT_URL must use the bounded plg_migrate pool'
[ "$(value POSTGRES_EXPORTER_DSN)" = "postgresql://plg_monitor:$monitor@postgres:5432/$database?sslmode=disable" ] || fail 'POSTGRES_EXPORTER_DSN must use plg_monitor'
[ "$(value REDIS_URL)" = "redis://:$redis@redis:6379/0" ] || fail 'REDIS_URL must use the configured private Redis password'
case "$otp_connector_token" in *[!0-9a-fA-F]* | '') fail 'OTP_CONNECTOR_INTERNAL_TOKEN must be hexadecimal' ;; esac
[ "${#otp_connector_token}" -eq 64 ] || fail 'OTP_CONNECTOR_INTERNAL_TOKEN must contain exactly 64 hexadecimal characters'
[ "$otp_connector_token" != "$(value METRICS_TOKEN)" ] || fail 'OTP connector and metrics tokens must differ'
[ "$otp_connector_token" != "$(value ACTION_TOKEN_ENCRYPTION_KEY)" ] || fail 'OTP connector and action-token secrets must differ'

clamav_timeout=$(value CLAMAV_TIMEOUT_MS)
case "$clamav_timeout" in *[!0-9]* | '') fail 'CLAMAV_TIMEOUT_MS must be numeric' ;; esac
[ "$clamav_timeout" -ge 500 ] && [ "$clamav_timeout" -le 15000 ] || fail 'CLAMAV_TIMEOUT_MS must be between 500 and 15000'

alert_webhook=$(value ALERT_WEBHOOK_URL)
case "$alert_webhook" in
  https://?*) ;;
  *) fail 'ALERT_WEBHOOK_URL must be an HTTPS URL to an off-host receiver' ;;
esac
compact_alert_webhook=$(printf '%s' "$alert_webhook" | tr -d '[:space:]') || \
  fail 'could not validate ALERT_WEBHOOK_URL whitespace'
[ "$compact_alert_webhook" = "$alert_webhook" ] || \
  fail 'ALERT_WEBHOOK_URL contains whitespace'
case "$alert_webhook" in
  *"'"* | *'"'* | *"\\"* | *'#'*)
    fail 'ALERT_WEBHOOK_URL contains unsafe characters'
    ;;
esac

if [ "$(value NEXT_PUBLIC_POSTHOG_ENABLED)" = 'true' ]; then
  [ "$(value NEXT_PUBLIC_POSTHOG_HOST)" = "$origin/e" ] || fail 'enabled PostHog must use the privacy-scrubbing same-origin proxy'
  [ -n "$(value NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN)" ] || fail 'enabled PostHog requires a project token'
  [ -f "$script_dir/../caddy/optional/posthog.caddy" ] || fail 'enabled PostHog requires caddy/optional/posthog.caddy'
  analytics_environment=$(value NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT)
  case "$analytics_environment" in
    *[!a-zA-Z0-9_-]* | '' | ? ) fail 'NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT is invalid' ;;
  esac
  [ "${#analytics_environment}" -le 32 ] || fail 'NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT is too long'
fi
