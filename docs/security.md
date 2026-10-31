# Security Architecture

## Authentication

- Opaque, random, server-side sessions; only a hash of the session token is stored.
- Host-only `HttpOnly`, `Secure`, `SameSite=Lax` cookie in production.
- Mutations validate CSRF header, Origin, and Fetch Metadata.
- Argon2id password hashes; credentials and tokens never enter `localStorage`.
- TOTP enrollment and step-up are implemented. Owner and Accounts sessions receive no operational grants until MFA has been verified.
- Ten 80-bit recovery codes are issued once after factor enrollment/regeneration. Only peppered SHA-256 digests are stored; each code is single-use, regeneration revokes older codes, and recovery revokes existing sessions.
- Changing MFA requires a fresh existing factor when one is already enrolled, revokes other sessions, and emits audit plus security outbox events.
- Redis-backed limits protect login, factor verification, step-up, and QR check-in by IP plus account/user identity. Sensitive limited routes fail closed when Redis is unavailable.
- Phone OTP is a fallback login method. Email/password remains the default, the server suppresses
  duplicate OTP issuance for 90 seconds, and only a non-staff user who explicitly trusts a personal
  device receives the bounded 30-day/seven-day session policy.
- Step-up freshness is ten minutes for role administration, tier-2 discounts, approvals, certificate revocation, final import, and sensitive exports.

WebAuthn and compromised-password screening remain production gates; see `implementation-status.md`. Password-reset email is a server-side worker flow with encrypted outbox secrets. Phone OTP is deliberately unavailable until an approved transport is installed.

## Authorization

1. The session guard resolves the user, organization, active roles, grants, assigned branches, and factor freshness.
2. The permission guard verifies permission plus O/B/A/S scope and enforces step-up.
3. Domain services query by `organization_id` and apply branch/assignment/self scope.
4. Composite PostgreSQL foreign keys reject cross-organization relationships even when application validation is wrong.

The web rewrite/proxy is networking only and is never treated as an authorization boundary.

## Data, files, and logging

- API responses use `private, no-store`; the PWA stores only shell assets, icons, and translations.
- Public certificate verification returns the minimum identity, program, issue date, and validity state.
- Certificate PDFs are responsible-uploaded private files. The API enforces PDF extension/MIME/magic/EOF, a 10 MB limit, rejects forms, scripts, launch actions, embedded files, and other active content, stores a SHA-256 hash, and serves only short-lived signed links.
- Finance exports require both export authority and fresh step-up MFA, retain the requester's authorized branch/enrollment scope, escape CSV formula prefixes, expire after 24 hours, and use short-lived signed links.
- Certificate verification tokens, sessions, TOTP codes, QR nonces, passwords, and raw import rows must not be logged.
- Decrypted password-reset tokens, OTP codes, recipient addresses, and provider credentials remain in worker memory only and must not be logged or published through realtime.
- OTP delivery is fail closed: the current provider performs no network I/O, channel reads never
  report availability, and connect/reset return the sanitized
  `OTP_CONNECTOR_NOT_CONFIGURED` error. Existing management permissions, audit records, and the
  immediate disable command are preserved for a future approved provider. The legacy `BAILEYS`
  status label is compatibility metadata, not an installed connector.
- Private files require short-lived signed access and malware/type/size validation before release.
- Legacy archive rows are AES-256-GCM encrypted with a production-only key.
- Paymob secret/HMAC/encryption keys stay server-side. Checkout client secrets are AES-256-GCM encrypted at rest. Redirects are never trusted; only a timing-safe verified HMAC webhook with an allowed Integration ID and exact amount/currency match can post money.
- Paymob callback bodies are processed in memory and represented by a SHA-256 payload digest plus normalized event identifiers. A database unique constraint rejects repeated provider events.
- Audit and outbox records are inserted in the same transaction as sensitive domain changes.

## Production gates

- Configure CSP with an explicit production allowlist and deny framing.
- Add WebAuthn.
- Integrate breached-password screening, install an approved OTP provider, and monitor self-hosted
  SMTP plus OTP delivery failures.
- Configure production R2 credentials and an independent malware-scanning control for uploaded PDFs; the implemented static active-content validation remains defense in depth, not an antivirus claim.
- Add PII log scanner, rate-limit store, dependency/SAST scan, and external penetration test.
- Configure encrypted PITR, off-provider copy, quarterly restore drill, RPO 15 minutes, RTO four hours.
