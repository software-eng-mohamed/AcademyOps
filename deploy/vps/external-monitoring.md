# External host-failure monitor runbook

The monitoring stack on the AcademyOps VPS cannot report a total VPS, Docker, network, or power failure. Configure a separate availability monitor in an independently operated region before production acceptance. This repository does not select or configure a provider account.

Monitor both public endpoints over HTTPS:

- `https://SITE_ADDRESS/api/v1/health/live` every minute. Require HTTP 200, valid TLS, and a total response time below five seconds.
- `https://SITE_ADDRESS/health` every minute. Require HTTP 200 and a JSON response identifying the web service as healthy.

Use at least two probe regions and alert only after two consecutive failures from both regions. Send the alert to an on-call destination that is outside the VPS and different from the application email path. Assign a named primary operator, backup operator, and a 15-minute escalation target. Never include response bodies, tokens, phone numbers, or student data in notifications.

The internal Prometheus rules `PostgresOffsiteBackupMissing` and `PostgresOffsiteBackupStale` cover backup telemetry while the host is running; Alertmanager forwards them to the configured external webhook. The external availability monitor covers loss of the whole host, including loss of Prometheus and Alertmanager themselves.

Acceptance evidence must contain the provider monitor ID, its two regions, the on-call owner, alert timestamps, and screenshots or exported event records for both a forced HTTP failure and its recovery. Run the failure exercise in an approved window by temporarily targeting a dedicated nonexistent test path or pausing the test origin. Do not interrupt the production database or delete the Cloudflare Tunnel to prove alerting.

Review the monitor and contact roster monthly. Exercise failure and recovery quarterly, and after changing DNS, Cloudflare Tunnel, Caddy, the alert webhook, or the incident rota.
