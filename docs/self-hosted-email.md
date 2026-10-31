# Self-hosted transactional email

AcademyOps sends email only from the BullMQ worker. The API persists an outbox event and never
connects to SMTP. Local development uses Mailpit; production uses a dedicated Postal installation.

## Local verification

1. Run `docker compose up -d mailpit redis postgres`.
2. Copy the `SMTP_*` values from `.env.example` into `apps/api/.env`.
3. Start the API and worker, request a password reset, then open `http://localhost:58025`.

Mailpit captures messages and never delivers them to public inboxes. Its ports bind to localhost,
so it must not be published through Cloudflare Tunnel.

## Production topology

- Run Postal on a dedicated, patched Linux host with a clean static public IP. Do not run it on a
  developer laptop or behind Cloudflare Tunnel.
- Expose the Postal administration UI only through a VPN or identity-aware access policy.
- Permit authenticated SMTP submission only from the worker network/IP. Prevent open relay.
- The worker connects to Postal using TLS, certificate validation, and restricted credentials.
- Postal performs internet delivery on port 25. The application never connects directly to a
  recipient mail server.

Required worker configuration:

```text
SMTP_HOST=mail.notify.example.test
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_TLS_SERVERNAME=mail.notify.example.test
SMTP_USERNAME=<restricted-postal-credential>
SMTP_PASSWORD=<secret>
SMTP_FROM_EMAIL=no-reply@notify.example.test
SMTP_FROM_NAME=AcademyOps
SMTP_RETURN_PATH=bounce@notify.example.test
```

Use port 465 with `SMTP_SECURE=true` only when Postal is configured for implicit TLS. Production
validation rejects a plaintext configuration. Rotate SMTP credentials through the deployment
secret store; never commit them or place them in `NEXT_PUBLIC_*` variables.

## DNS and reputation gate

Do not enable public delivery until all of these pass:

- `mail.notify.example.test` has an A record pointing directly to the static mail IP (DNS-only).
- The hosting provider sets PTR/rDNS for that IP back to `mail.notify.example.test`.
- Postal provides a 2048-bit DKIM record for the sending domain.
- SPF authorizes only the Postal IP.
- DMARC starts in monitoring mode with aggregate reports, then moves to quarantine and reject
  after legitimate traffic is verified.
- Forward DNS and PTR match, TLS is valid, and the IP is absent from common blocklists.

Warm up a new IP gradually. Test password reset and session notifications with Gmail, Outlook, and
Yahoo seed accounts before production promotion. Inbox placement cannot be guaranteed by code;
sender reputation, recipient engagement, and complaint rate remain operational controls.

## Delivery guarantees

Every application retry reuses a deterministic `Message-ID` derived from the business idempotency
key. Security messages also use the Redis delivery ledger. SMTP acceptance and database/Redis state
cannot form one atomic transaction, so a connection loss after Postal accepts a message can still
produce an at-least-once duplicate. Password reset links remain safe because repeated messages carry
the same short-lived token. Postal bounce/complaint ingestion and a durable suppression list are the
next production gate after the Postal host is available.
