# Production security baseline

This document is the release security contract for AcademyOps. It targets the controls relevant to
OWASP ASVS Level 2; it is not a claim that the system is impossible to compromise.

## Enforced in code

- Every HTTP route is authenticated by default. Public routes are explicit and rate limited where
  they accept attacker-controlled work.
- Authorization is tenant scoped and permission based. Staff roles require MFA, and high-impact
  permissions require a fresh step-up. The final active Owner cannot be removed or suspended.
- Sessions use host-only Secure, HttpOnly, SameSite=Strict cookies in production, an independent
  CSRF token, and exact Origin validation. Staff and standard sessions have a 12-hour absolute
  lifetime and 30-minute idle timeout. A student may explicitly trust a personal device for a
  bounded 30-day absolute lifetime and seven-day idle timeout; the server ignores that request for
  every account with an active non-Student role.
- Password, OTP, reset-token, TOTP, recovery-code, and session comparisons use slow hashing or
  timing-safe cryptographic verification as appropriate. TOTP counters are consumed atomically to
  block replay.
- AES-256-GCM envelopes require a 12-byte IV and a 16-byte authentication tag. Keys for different
  purposes must be distinct, and API/worker action-token encryption uses one shared secret.
- Paymob callbacks require the official 20-field HMAC, a configured integration ID, exact amount and
  currency, strict provider/internal identifiers, database locking, and idempotent event/payment
  constraints.
- Browser responses use nonce-based CSP, HSTS, no-referrer, clickjacking protection, MIME sniffing
  protection, restrictive permissions policy, no-store application pages, and same-origin isolation.
- Realtime accepts WebSocket only, exact Origin, a one-time short-lived ticket, bounded frames and
  connections, tenant rooms, sanitized invalidations, and periodic session revalidation.
- XLSX uploads are size/count bounded before parsing, reject active content and unsafe ZIP paths,
  disable XML entities, and cap expanded data, rows, cells, and strings. PDF uploads are bounded,
  attachment-only, and reject encrypted, object-stream, embedded, scripted, remote-action, form, and
  trailing-polyglot content.
- Private files can only receive signed download URLs when their database classification is PRIVATE
  and scan status is CLEAN. Sensitive reset/OTP queue payloads are removed after terminal delivery
  and their processed outbox payloads are redacted after one hour.
- Production configuration fails closed if HTTPS origins, private object storage, notification
  delivery, payment credentials, archive encryption, or required distinct secrets are missing.
- CI runs immutable installs, dependency audit, migrations on clean PostgreSQL, generated-contract
  drift, line limits, lint/type/tests/build, a distroless non-root image check, a
  critical/high/medium actionable image CVE gate plus complete unfixed inventory, full-history
  secret scan, mandatory Semgrep OWASP SAST, conditional CodeQL where GitHub supports it, and a
  portable production-license gate plus pull-request dependency review.

## Required launch controls outside the repository

1. Protect `main`; require CI and Security, review by another engineer, signed commits if the
   organization supports them, and no administrator bypass for routine releases. Require CodeQL
   after GitHub Code Security is enabled for the repository.
2. Enable GitHub private vulnerability reporting, Dependabot security updates, and secret scanning
   with push protection.
3. Put the public API behind managed DDoS/WAF controls. Alert on authentication, reset, OTP, Paymob,
   signed-file, 4xx/5xx, Redis, and readiness anomalies without logging tokens or personal data.
4. Use least-privilege R2, self-hosted SMTP, approved OTP-provider, Paymob, database, and Redis credentials. Separate
   production/staging/preview. Never paste production data into tests, AI prompts, tickets, or logs.
5. Confirm the R2 bucket has no public listing/read policy, object versioning is enabled, and lifecycle
   deletion matches the academy retention policy.
6. Enable PostgreSQL PITR and encrypted backups, then perform and record a restore drill. Backups that
   have never been restored are not considered ready.
7. Treat the built-in PDF checks as a strict content gate, not an antivirus engine. For a high-assurance
   environment, add a managed malware scanner/content-disarm step before setting uploaded assets to
   CLEAN. Until then, keep certificate upload limited to trusted MFA-protected staff and downloads as
   attachments only.
8. Resolve the workbook's quarantined rows through the Data Steward workflow. Never bypass quarantine
   to meet a launch date.
9. Run an independent authenticated penetration test against staging, including cross-tenant IDOR,
   role escalation, CSRF, WebSocket, import bombs, PDF polyglots, Paymob replay, race conditions, and
   business-logic abuse. Retest every critical/high finding before production promotion.

## Release checklist

- `pnpm api:generate` and `pnpm verify:release` pass from a clean checkout.
- All migrations apply to an empty database and a restored production-like backup.
- The backend image runs on a pinned distroless base as UID/GID `65532`, contains no shell, package
  manager, source/tests/environment files, or service-writable application code. It has no actionable
  critical, high, or medium image finding; every upstream finding without a vendor fix remains visible
  in CI and must be patched as soon as a fixed base is published.
- Production secrets are set once in the approved secret store; no generated key is independently
  regenerated for the worker. All previous or exposed credentials are rotated.
- Test login, MFA setup/step-up/replay rejection, session idle expiry, password reset, phone OTP,
  authorization denial, owner continuity, Paymob HMAC/replay/amount mismatch, XLSX rejection, private
  file denial, QR replay, certificate eligibility, realtime reconnect, and audit/outbox delivery.

## Incident response minimum

1. Disable the affected route/integration or block the indicator at the edge.
2. Preserve immutable audit, provider, database, and deployment evidence without copying secrets.
3. Revoke impacted sessions and tokens; rotate only the affected purpose-specific keys. Coordinate
   shared action-key rotation across API and worker after in-flight reset/OTP jobs expire.
4. Restore or reconcile financial and attendance state from authoritative events; never edit ledgers
   directly.
5. Document scope, notification obligations, remediation, regression tests, and a dated retest.
