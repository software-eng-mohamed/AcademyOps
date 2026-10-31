# Implementation Status

Updated: 2026-09-08

This is an implementation inventory, not release-acceptance evidence. Counts and verification
results recorded below are the historical 2026-08-15 baseline unless a newer date is stated. Use
the signed release manifest, `deploy/vps/README.md`, and the current delivery review for promotion.

## Implemented foundation

- Separate pnpm/Turborepo repository with Next.js 16, NestJS 11 API, same-codebase worker, shared contracts, Docker Compose, CI, immutable backend/web containers, and a hardened single-VPS production topology.
- PostgreSQL schema and thirty-six migrations for identity, phone OTP login, student self-registration/review, CRM, academic scheduling, enrollment, AR ledger, Paymob gateway attempts/events, attendance, responsible-uploaded certificates, scoped reporting/exports, imports, audit, outbox, and organization OTP-channel administration.
- Composite tenant FKs, monetary/time checks, partial unique indexes, room/trainer exclusion constraints, deferred installment total trigger, allocation/refund guards, and issued-record immutability.
- Opaque sessions, CSRF/origin validation, Argon2id, TOTP MFA/step-up, hashed one-use recovery codes, MFA/password/role session invalidation, hashed one-use password-reset tokens, secure phone OTP request/verification with encrypted outbox delivery payloads, Redis rate limits, permission matrix, branch/assignment/self access context, audit, and no-store responses.
- Branch, user, role, grant, role-assignment, and branch-assignment administration APIs with optimistic concurrency, immutable system roles, active-assignment history, and database protection for the last active Owner.
- Bilingual public student self-registration with unique active email/phone identifiers, pending account state, Owner-only approval/rejection with fresh TOTP step-up, mandatory recorded in-person email-ownership proof before approval, Student-role activation, immutable audit evidence, outbox records, and database-enforced legal review transitions.
- Academic catalog APIs for programs, immutable published program versions, curricula, modules, cohorts and state commands, rooms, trainers, sessions, and scoped calendar reads. PostgreSQL enforces published-version activation, curriculum immutability, valid session links, and room/trainer schedule conflicts.
- CRM/Students/Enrollment APIs for candidate-only person matching, student and contact administration, individual/corporate billing accounts, branch-scoped business accounts, configurable lead stages, lead ownership and state commands, atomic lead conversion, enrollment creation and lifecycle commands, dated cohort transfers, cancellation approval, and module-retake approval. Optimistic concurrency, audit/outbox boundaries, organization/branch/assignment/self scopes, payer ownership, capacity, and legal state transitions are enforced.
- Finance APIs for pricing agreement drafts, 10% default Tier 1 versus Tier 2 discount approval, immutable submitted pricing, approved installment schedules, derived billing/enrollment balances, payment and refund state, invoice payment state, receipts, and receivables aging. Every finance mutation is scoped before idempotency replay, and PostgreSQL enforces pricing/schedule transitions, exact installment totals, and post-approval immutability.
- Attendance APIs for versioned program/cohort policies, configurable check-in windows, organization/branch/trainer/self scoped rosters and records, enrollment ratios, rotating QR check-in, manual roster recording, optimistic corrections, makeup credits, and scoped anomaly review. PostgreSQL enforces roster membership, status/source/version integrity, matching append-only events, non-overlapping policy periods, and one-use makeup records.
- Reporting APIs provide organization/branch/assignment scoped operations overviews and finance receivables snapshots. Sensitive finance CSV exports run through an idempotent outbox/BullMQ job, preserve a scope snapshot, require fresh MFA, neutralize spreadsheet formulas, and produce private signed downloads.
- Lead state commands/conversion, dated enrollment placement and transfer, activation/completion/cancellation, payment posting/rejection/allocation/receipt, Paymob installment checkout and signed idempotent webhook posting, reversal/refund maker-checker, invoice draft/issue/cancel/void/credit notes, session scheduling, QR/manual attendance, corrections/makeup, and certificate evaluation/issue/responsible PDF upload/download/revoke/reissue/fulfillment/verification with the 80%-and-paid gate.
- Outbox dispatcher with idempotent BullMQ job IDs, private self-hosted SMTP email delivery,
  fail-closed OTP provider abstraction, operator site/email alerts, Redis delivery replay
  protection, a policy-driven attendance worker, and a resumable finance-report export worker.
- A compact organization-scoped Messaging dashboard and its audited management contracts control
  an isolated `whatsapp-web.js` connector. Connect exposes a protected linked-device QR flow;
  availability requires a fresh healthy linked session, Disable blocks delivery, and Reset removes
  the session. The connector sends only bounded OTP messages and has no database, Redis, SMTP, R2,
  Paymob, or API-session credentials. It fails closed while disabled, disconnected, or stale.
- Arabic/English server-rendered PWA shell with API-only backend access, explicit sensitive-cache
  bypass, and accessible Email/Password-first login. Phone OTP is marked as a fallback, applies a
  server-enforced 90-second resend cooldown, supports an explicit trusted-personal-device policy for
  students only, preserves short staff sessions, and retains localized validation and generic
  request feedback.
- Value-only OOXML ingestion that survives broken comment metadata, preserves errors/formulas, stages hidden sheets, hashes sources/rows, normalizes known fields, and encrypts archive-only sheets.

## Production completion gates

These are deliberately not represented as complete:

- Complete operational and legal acceptance of the isolated unofficial WhatsApp linked-device
  connector, dedicate a non-critical Business number, prove pairing/reset/health monitoring and
  real delivery to an approved test recipient, and document a supported fallback. The code path is
  implemented; production linking and provider acceptance remain external gates.
- WebAuthn and breached-password screening. The private SMTP service still requires DNS reputation,
  deliverability monitoring, and production credentials. The future approved OTP provider requires
  production credentials, delivery monitoring, and a documented fallback.
- Production R2 credentials and an independent malware scanner for responsible-uploaded certificate PDFs. Private local/R2 storage abstraction, signed links, and PDF static active-content validation are implemented.
- Extend stored idempotency replay if new sensitive commands are added. Current Lead conversion, financial commands, QR check-in/correction, certificate issue/revoke, and final import use PostgreSQL advisory serialization, request hashes, and stored response replay.
- Additional management report types beyond the implemented operations overview, finance balance/aging/receivables, and finance receivables CSV export.
- Complete A-scope assignment repositories for the remaining operational modules.
- Workbook-specific Data Steward matching UI and domain promotion mappings. Current importer is staging/validation/archive/reconciliation infrastructure only.
- Final stakeholder UAT of the Owner/Operations, Accounts, Attendance, Student, Imports, Staff &
  Access, and Messaging workspaces on production-like data.
- Paymob merchant test/production credentials, enabled payment-method Integration IDs, sandbox/live end-to-end reconciliation, and operational handling for unknown/reversal-observed gateway attempts. The adapter is implemented but cannot be live-tested without the merchant configuration.
- Expanded PostgreSQL concurrency suites, full browser E2E, load test, security test, backup restore drill, UAT, training, and production sign-off.

## Milestone position

M0 decisions and defaults are recorded. M1 foundation is implemented. M2 IAM/RBAC, M3 Academic/Scheduling, M4 CRM/Students/Enrollment, M5 Finance, M6 Attendance, and the M7 Certificates/Reports backend now have their core APIs, state guards, audit/outbox boundaries, scoped repositories, and PostgreSQL acceptance constraints. Certificate artwork is intentionally uploaded by the responsible Academic/Owner user rather than generated. M7 full operational PWA screens remain, and M8 has a tested source reader and staging controls while workbook-specific promotion and cutover remain gated.

This status is intentionally strict: successful compilation is not treated as production acceptance.

## Historical verification baseline — 2026-08-15

- The production dependency audit and license gate pass with no Baileys/libsignal runtime and no
  GPL/AGPL policy exception.
- `prisma migrate deploy` applied all thirty-six migrations to a clean PostgreSQL 17 volume. Prisma
  schema validation and migration status pass, and a shadow-database comparison reports no drift.
- The latest `pnpm verify` passes 421 API tests, 115 web tests, 52 API-client tests, 15 shared
  contract tests, and 29 line-gate tests (632 total), with zero failures or skipped PostgreSQL/Redis
  suites. Formatting, lint, typecheck, physical-line limits, and all six production builds pass.
- Eleven focused phone OTP tests passed against real PostgreSQL. A disposable real-HTTP smoke proved enumeration-safe requests, encrypted delivery data, successful verification, correct cookies, identifier verification, a live session, and matching audit/outbox evidence; the temporary database and process were removed afterward.
- TestSprite reported all six bilingual phone-login scenarios passing. Independent browser verification submitted a real OTP from the encrypted disposable outbox, reached `/en/dashboard`, and reconciled one verified identifier, session, consumed challenge, audit, and outbox record before cleanup.
- TestSprite reported all five public registration scenarios passing. The password-mismatch behavior was independently verified in the browser; the Owner/TOTP review flow still requires browser E2E coverage.
- PostgreSQL integration tests exercise tenant FK rejection, append-only ledger rejection, active-room overlap rejection, idempotency replay/payload mismatch, issued-invoice immutability, and credit-note totals.
- PostgreSQL integration tests also enforce one active Paymob attempt per installment, immutable gateway identity/amount, and append-only gateway events.
- Authenticated HTTP smoke tests covered every M3 read endpoint plus create program, create module, and create draft version. Tagged mutable smoke entities were removed after verification; append-only audit evidence was retained.
- Authenticated HTTP smoke tests covered all M4 list endpoints plus student create/update/contact replacement/read and business-account create/update/read. The temporary role and all mutable smoke entities were removed after verification; append-only audit evidence was retained.
- An isolated authenticated M5 HTTP smoke test covered program/student/enrollment creation, pricing update/submit/approval, installment approval, enrollment activation, ledger debit creation, full payment allocation, internal invoice/receipt issue, zero-balance reconciliation, and all new finance read models. It ran on a temporary database that was dropped after success.
- An isolated authenticated M6 smoke test covered policy creation, attendance-window commands, rotating QR creation, student check-in and idempotent replay, correction/version history, scoped roster and ratio reads, and closed-challenge anomaly persistence. The worker separately converted roster omissions to `ABSENT` and locked eligible sessions; the temporary database was dropped after success.
- An isolated authenticated M7 certificate smoke test proved the exact `0.8000` attendance boundary, zero-balance release, `PENDING_UPLOAD` issuance, responsible PDF upload, student-scoped signed download, public verification, print/ready/collect transitions, revocation, and audited reissue with a second responsible upload.
- An isolated authenticated reporting smoke test proved branch-scoped operations/finance totals, exact debit/allocation/outstanding reconciliation, export idempotency, background CSV generation, scope preservation against a second branch, and signed `.csv` download.
- The Redis limiter was smoke-tested in the final Linux image: attempts 1-10 returned authentication failures and attempt 11 returned HTTP 429; the container ran as a non-root service user.
- The source workbook parser read all nine sheets and 9,434 non-empty rows without changing the source; its SHA-256 matched the recorded baseline.
- The backend Docker image starts API and worker on a shell-free distroless runtime as UID/GID 65532. Its application code is not writable by the service user; API readiness/liveness returned
  200 and the worker stayed running against PostgreSQL 17 and Redis 7.4. Trivy reported zero
  actionable Critical, High, or Medium findings in the rebuilt image.
- Browser verification covered the Arabic production login page, an invalid login through the real
  API boundary, a valid cookie session, and the authenticated first-login redirect. No Next error
  overlay, console warning, or console error was detected.
