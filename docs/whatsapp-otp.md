# WhatsApp QR OTP connector

This feature deliberately uses `whatsapp-web.js` and WhatsApp Linked Devices rather than the official Meta Business API. The choice avoids a per-message Meta subscription, but it is not an official or guaranteed integration: WhatsApp may disconnect, restrict, or ban the linked number. Use a dedicated disposable Business number, not a personal or business-critical account.

## Architecture

- The protected Owner/OTP Operator dashboard issues audited Connect, Reset, and Disable commands and displays a short-lived QR.
- The API stores channel state in PostgreSQL and stores the QR encrypted in Redis with a short TTL. It never stores or returns the unmasked phone number.
- `@academyops/otp-connector` runs Chromium and `whatsapp-web.js` in a separate container. It owns the `LocalAuth` profile in the `otp-connector-session` volume.
- The worker sends a bounded E.164 recipient, localized OTP body, organization UUID, and event idempotency key to the connector over a private network.
- The connector accepts no inbound message actions, has no public port, and receives no database, Redis, SMTP, R2, Paymob, password, MFA, or web-session secrets.
- A 75-second heartbeat watchdog blocks phone OTP and creates in-app, realtime, and email alerts when the connector becomes stale.

The database provider value remains `BAILEYS` only for backward-compatible API/schema contracts; the active runtime is `whatsapp-web.js`.

## Operator flow

1. Open the separate `/{locale}/whatsapp` workspace as Owner or a dedicated user with organization-scoped `messaging.otp.read` and `messaging.otp.manage`.
2. Complete TOTP step-up when prompted.
3. Enter an audit reason and choose Start/reconnect.
4. When the status becomes “QR scan required”, choose Show QR code.
5. On the dedicated phone, open WhatsApp → Linked devices → Link a device and scan the QR.
6. Wait for “Connected and healthy” and confirm the masked final four digits.
7. Test one login OTP to an authorized test recipient. Never bulk-send during validation.
8. Choose Disable to stop sends while retaining the linked session, or Reset to log out and delete the linked profile before issuing a new QR.

## Local real-number acceptance

Use only the local synthetic tenant and an authorized test phone. Generate one shared 64-hex token in memory and pass the same value to API, worker, and connector. Keep `WEB_ORIGIN`, API, web, and realtime on localhost. Store the connector profile only under ignored `test-results/whatsapp-session`.

Run the API, web, worker, and connector in separate terminals. The connector needs installed Chrome and these values:

```text
NODE_ENV=development
OTP_CONNECTOR_INTERNAL_TOKEN=<same-random-64-hex-token>
OTP_CONNECTOR_API_URLS=http://127.0.0.1:3001
OTP_CONNECTOR_SESSION_PATH=<repo>/test-results/whatsapp-session
```

After scanning, request one OTP from the phone-login screen. Prove all of the following before calling the test successful:

- The request returns the generic accepted response without exposing whether the phone exists.
- Exactly one `security.phone_otp_requested` event exists and the worker records one successful delivery.
- The WhatsApp recipient receives one six-digit, short-lived code with no password or personal data.
- The code logs in once; replay and five wrong attempts fail; expiry fails; the challenge becomes consumed or revoked.
- Disable immediately makes new requests fail closed. Killing the connector makes the watchdog mark it stale and notify the configured operators.
- Reset deletes the linked session and requires a new QR.

Delete the local test session directory after the test if the linked test number should be unpaired.

## Security and reliability limits

The connector suppresses duplicates through the worker delivery ledger, in-memory in-flight keys, and 24-hour hashed markers in the session volume. A crash after WhatsApp accepts a message but before the connector durably records success can still duplicate one OTP because WhatsApp Web exposes no server-side idempotency key.

The Chromium sandbox is disabled inside the connector because the hardened container has no `SYS_ADMIN` capability. The service compensates with a separate image, non-root user, read-only root filesystem, capability drop, no-new-privileges, process/memory/CPU limits, an internal-only control network, and no application data credentials. This remains a deliberate residual risk.

The connector uses Puppeteer 25.16.0 and a matching digest-pinned browser image. This dependency path no longer includes the legacy `extract-zip` downloader, and production audits have no ignored advisories. A focused `whatsapp-web.js` patch uses Puppeteer's `Browser.connected` property during shutdown and logout; regression tests exercise both lifecycle paths. Browser downloads remain disabled during dependency installation.

Never promise uninterrupted delivery from this channel. Keep Email + Password as the primary login and use phone OTP only when requested. During a connector incident, Disable the channel; the system fails closed instead of silently accepting OTP requests that cannot be delivered.
