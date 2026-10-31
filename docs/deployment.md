# Deployment

The security launch contract in `docs/security-hardening.md` is mandatory for production promotion.

## Supported production topology

The single Ubuntu 22.04 VPS topology under `deploy/vps/` is the sole supported production target.
Its runbook is `deploy/vps/README.md`, and `deploy/vps/runtime.env.example` is the authoritative
runtime-variable contract. Do not infer a supported deployment from a provider-specific template.

The VPS stack deploys the web app, two API replicas, worker, PostgreSQL, Redis, private ClamAV,
authenticated API/worker metrics, and Alertmanager webhook delivery together with the documented monitoring components. Caddy is
the only public ingress; data and monitoring services remain on private networks. Production
images are built from a reviewed commit on a trusted build host, signed, transferred, and deployed
through the release scripts. Never build source on the production VPS.

Run `deploy/vps/scripts/preflight.sh` before promotion. It validates the host, required secrets,
TLS origins, storage/mail settings, metrics token, Cloudflare Tunnel token, image tag, and Compose
configuration. Keep production, staging, preview, and synthetic-test credentials and data fully
separate.

This topology is a hardened single-host deployment, not high availability. Its API, worker,
database, cache, and monitoring still share one failure domain. The VPS runbook defines the
required off-host encrypted backups, restore drills, load-test placement, and the conditions for
moving state or application replicas off-host.

## Release order

1. Database backup/restore readiness.
2. Install the verified signed release bundle and run the expand-only migration through the VPS
   release script.
3. API readiness check.
4. Worker readiness and private metrics scrape.
5. Web deploy and same-origin HTTP/WebSocket routing through Caddy.
6. Verify Prometheus can reach Alertmanager, run the local receiver test, and record a separately
   approved test alert from the production webhook plus the external host-monitor evidence.
7. From the protected Messaging dashboard, link only the approved dedicated WhatsApp test number,
   wait for the connector to report available, send one OTP to an approved test recipient, and
   reconcile its audit/outbox/connector evidence. Verify Disable blocks delivery and Reset removes
   the linked session. The unofficial connector and production number still require explicit
   operational acceptance; a configured connector must not be documented as unavailable.
8. Verify an immediate OTP retry creates no second message. Test that “remember this device” gives
   only a Student the bounded 30-day/seven-day session and remains 12-hour/30-minute for Staff.
9. Smoke test login, authorization denial, lead conversion, payment receipt, Paymob signed-webhook reconciliation, QR flow, the 80%-plus-paid certificate issue → responsible PDF upload → student download flow, and one scoped background finance export.
