# AcademyOps development roadmap

> Historical planning snapshot. Its readiness percentage, route/model/migration counts, and
> “missing” feature statements describe the repository when this roadmap was written and must not
> be used for current release acceptance. Current implementation facts are maintained in
> `docs/implementation-status.md`; production gates are in `docs/deployment.md` and
> `deploy/vps/README.md`.

## 1. System Context & Audit Facts

- **Monorepo**: Next.js 16 (web), NestJS 11 (API), BullMQ worker, PostgreSQL/Prisma, shared contracts/API client.
- **Current Readiness**: ~44%. Backend foundation is strong; operational UI and E2E workflows are incomplete. 178 API routes, 84 Prisma models, 26 database migrations.
- **Verification Baseline**: `lint`, `typecheck`, 62 tests (Vitest), and `build` pass locally. 13 Postgres integration tests skipped without `DATABASE_URL`. Repository-wide Prettier check (`pnpm format:check`) currently fails across multiple files.
- **Current vs Target State Gaps**:
  - _IAM/RBAC_: API supports email/phone, but web UI is email-only. Public self-registration/approval, phone OTP, and `OPERATIONS` least-privilege role are **missing**. Default permissions currently allow broader reversal/refund access than required; RBAC corrections required (**Partial**).
  - _Academic/Scheduling_: Backend catalog APIs exist; session conflict detection and operational scheduling UI are **partial**.
  - _Attendance_: Session QR flow exists; signed stable student QR, staff scanning, explicit Close (unscanned -> ABSENT + lock), and audited corrections are **missing/partial**.
  - _Accounts/Ledger_: Database schema supports append-only/reversal mechanisms, but UI, flexible installments, Paymob sandbox/webhook reconciliation, and Owner-only reversal/refund UX are **partial**.
  - _Certificates_: 80% attendance + zero balance gate implemented in API; UI issuance and student portal integration are **partial**.
  - _Import/Migration_: Staging/validation exists; domain promotion into entities, reconciliation, and data steward UI are **missing**.
  - _Notifications_: Read APIs exist; event outbox/BullMQ delivery pipeline (email/in-app) is **missing**.
  - _Production Infrastructure_: `API_ORIGIN` vs `API_INTERNAL_URL` mismatch, missing CI secrets (`PASSWORD_RESET_PEPPER`, `ACTION_TOKEN_ENCRYPTION_KEY`), weak OpenAPI schemas.

## 2. Architecture & File Decomposition Strategy (≤300 Physical Lines)

- **Constraint**: Every manually maintained file must be ≤300 physical lines. Machine-generated artifacts (`packages/api-client/src/generated.ts`), lockfiles, migrations, and raw dumps are exempt.
- **Current Baseline**: 25 maintained files exceed 300 physical lines (e.g., 1,812-line Postgres integration test, 1,331-line `schema.prisma`, services 1,397–330 lines, 542-line seed script, `catalog.controller.ts` 315, `migration-contract.test.ts` 312, `mfa.service.ts` 310, `catalog.dto.ts` 304, web components 383 & 330 lines).
- **Automated Gate**: Add `pnpm max-lines` CI check counting true physical lines (including blanks, via Node split/Count). Phase 0 emits warnings; Phase 1 makes it strictly blocking.
- **Decomposition Responsibility Queue**:
  1. _Finance Commands_: Extract payment posting, allocations, reversals, refunds from `finance.service`.
  2. _Finance Queries_: Extract receivables aging, ledger reads, derived balances from `finance-read.service`.
  3. _Pricing/Paymob_: Split `pricing.service` & `paymob-payments.service` into plans, schedules, checkout, webhooks, reconciliation.
  4. _Academic API & Surface_: Split `academic.service`, `catalog.service`, `catalog.controller.ts` (315 lines), and `catalog.dto.ts` (304 lines) into modular controllers, DTO slices, and lifecycle services.
  5. _CRM_: Split `leads.service` into lead lifecycle, assignments, stage transitions, conversion.
  6. _Attendance_: Split `attendance.service` into session control, marks, QR verification, corrections, policy evaluation.
  7. _IAM & Auth_: Split `iam-administration.service`, `auth.service`, and `mfa.service.ts` (310 lines) into users, roles, invitations, OTP, MFA steps, and tokens.
  8. _Read/Domain_: Split `dashboard.service`, `search.service`, `students.service`, `certificates.service`, `imports.service`.
  9. _Prisma Schema_: Decompose `schema.prisma` into modular domain schema files using verified multi-file schema support (or pre-conversion compatibility spike).
  10. _Seed_: Modularize `seed-ui-demo.ts` into domain fixtures/seeders.
  11. _Tests_: Extract shared real-DB harness; decompose `postgres-contract.integration.test.ts` (1,812 lines) & `migration-contract.test.ts` (312 lines) into focused domain integration suites.
  12. _Web_: Decompose `dashboard-view.tsx` (383 lines) & `onboarding-flow.tsx` (330 lines) into page shells, section components, hooks.

## 3. Phased Implementation Roadmap

### Phase 0: Engineering Baseline & Config Hardening (1–2 EW)

- **Objective**: Fix dev/CI configuration, standardize formatting, introduce true physical line-limit tooling.
- **Status**: Current: Partial -> Target: Production Baseline.
- **Deliverables**: Fix `API_ORIGIN`/`API_INTERNAL_URL` mismatch, configure CI secrets, standardize formatting across repo, enable real Postgres test suite in CI, add non-blocking max-lines script (true physical line counting).
- **Tasks**: Fix env config; add missing CI secrets; run prettier format baseline; add line count scanner script; improve initial OpenAPI DTO schema slice for Auth.
- **Dependencies**: None.
- **Exit Gate**: `pnpm verify` AND `pnpm db:validate` pass cleanly with zero Postgres test skips.
- **Risks**: Repository-wide Prettier diff; mitigate by executing as an isolated, non-functional commit.

### Phase 1: Code Base Decomposition & CI Gating (4–6 EW)

- **Objective**: Decompose all 25 maintained files >300 lines without altering behavior, then make max-lines CI check blocking.
- **Status**: Current: Missing -> Target: Fully Enforced.
- **Deliverables**: Decomposed services, Prisma schema, seed script, integration tests, and UI components; blocking CI line-count gate.
- **Tasks**: Decompose backend services by module; refactor Prisma schema; split integration test suite; decompose UI components; flip CI max-lines check to blocking.
- **Dependencies**: Phase 0.
- **Exit Gate**: 0 maintained files >300 lines; max-lines CI check strictly blocking; no skipped/weakened tests; behavior-parity targeted gates pass (with no coverage regression once measured baseline exists).
- **Risks**: Regression during refactoring; mitigate with pre-refactor test coverage and atomic per-file review.

### Phase 2: IAM, Registration & Least-Privilege RBAC (3–4 EW)

- **Objective**: Establish secure multi-identifier authentication and role-based access control with add-only financial protections.
- **Status**: Current: Partial -> Target: Complete.
- **Deliverables**: Public student self-registration, Owner approval flow, Email/Password + Phone/OTP auth, `OPERATIONS` role definition, route guards, explicit RBAC correction for reversal/refund permissions.
- **Tasks**: Build self-registration & approval UI/API; add Phone/OTP verification flow; introduce `OPERATIONS` role & permission matrix; restrict financial reversal/refund initiation/approval exclusively to Owner.
- **Dependencies**: Phase 1.
- **Exit Gate**: E2E test passing for self-registration -> approval -> login; authorization matrix verified via negative tests (e.g., Accounts cannot execute reversals, Operations cannot perform Owner financial actions).
- **Risks**: Account duplication across email/phone; mitigate with canonical identity matching.

### Phase 3: Migration Engine & Historical Workbook Reconciliation (4–6 EW)

- **Objective**: Import and reconcile historical data from the 3 visible sheets (Master Sheet, Attendance & Cert., Annual Calendar - 2026).
- **Status**: Current: Partial (Staging only) -> Target: Complete Idempotent Promotion.
- **Deliverables**: Staging-to-domain promotion pipeline, alias normalization, quarantine system, reconciliation reports, data steward UI.
- **Tasks**: Implement domain promotion transactions; write normalizers for financial aliases & typos; build exception quarantine engine; construct source-vs-domain reconciliation report; conduct 3 dry runs.
- **Workbook Facts & Staging**: Process 927 operational rows and 114 sessions; resolve overpayments (24 cases), missing templates, room conflicts, broken formulas (`#REF!`, `#DIV/0!`). Ingestion preserves source workbook evidence in immutable staging (sheet name, cell/row address, raw value, formula text, display value, Excel error metadata); domain promotion uses normalized entities.
- **Dependencies**: Phase 2. Note: Phase 3 migration and Phase 4 product UI work may overlap once schema contracts stabilize, but final production cutover depends on both.
- **Exit Gate**: 100% historical source row traceability (promoted or quarantined); zero unverified financial or attendance drift; sign-off from Owner.
- **Risks**: Loss of context on incomplete calendar rows; mitigate by enforcing manual data steward review.

### Phase 4: Academic Operations Core & Conflict-Aware Scheduling (5–7 EW)

- **Objective**: Enable full operational administration of courses, cohorts, rooms, trainers, and sessions.
- **Status**: Current: Partial (Backend APIs only) -> Target: Operational UI Complete.
- **Deliverables**: Management UI for students, courses, cohorts, rooms, trainers; conflict-aware session calendar; multi-enrollment support.
- **Tasks**: Build course/cohort management screens; develop interactive session calendar with conflict detection (room/trainer overlaps); implement student cohort assignment & transfer UI.
- **Dependencies**: Phase 2 (schema stability allows parallel iteration with Phase 3).
- **Exit Gate**: Owner/Operations can create catalog, schedule sessions with automatic conflict blocking, and manage multi-course student enrollments via UI.
- **Risks**: Complex calendar timezone/overlap math; mitigate with database exclusion constraints and backend validation.

### Phase 5: Attendance Management, Signed QR & Session Locking (3–4 EW)

- **Objective**: Digital attendance tracking via stable signed student QR codes and staff session scanning.
- **Status**: Current: Partial (Rotating QR only) -> Target: Signed Student QR + Staff Scanner Complete.
- **Deliverables**: Signed student QR generation, staff session scanner interface, explicit Close Attendance execution, audited manual corrections.
- **Tasks**: Generate signed, stable student QR tokens; build staff scanner screen tied to active session; implement Close Attendance batch operation (marking unscanned as ABSENT and locking session); build audited correction UI (Owner/Operations only).
- **Dependencies**: Phase 4.
- **Exit Gate**: Scanning valid/invalid/duplicate QR codes operates correctly in UI/API; Close Attendance atomically locks session and marks unscanned students ABSENT; corrections leave immutable audit log.
- **Risks**: QR code sharing/replay; mitigate with HMAC signature, student photo display on scanner, and anomaly logs.

### Phase 6: Financial Ledger, Flexible Installments & Paymob Sandbox Readiness (3–5 EW)

- **Objective**: Complete financial management with add-only ledger, flexible installment plans, and sandbox-verified Paymob integration.
- **Status**: Current: Partial -> Target: Sandbox Verified & Production Config Ready.
- **Deliverables**: Add-only payment recording UI, flexible installment plan builder, Owner-only reversal/refund flow, Paymob sandbox integration & webhook reconciliation engine.
- **Tasks**: Build cash/transfer payment entry UI; implement per-enrollment installment schedule customizer; construct Owner reversal/refund workflow (append-only); finalize Paymob sandbox webhook handling, signature verification, and daily reconciliation worker.
- **Dependencies**: Phase 4.
- **Exit Gate**: Ledger integrity invariants pass; Paymob sandbox checkout & webhook processing succeed; refunds/reversals correctly update derived balance without altering historical records.
- **Risks**: Webhook delivery failure or double-processing; mitigate with PostgreSQL advisory locks, request hashing, and stored response replay.

### Phase 7: Event Outbox, Notifications & Calendar Messaging (2–3 EW)

- **Objective**: Asynchronous delivery pipeline for in-app and email notifications.
- **Status**: Current: Missing (Read APIs only) -> Target: Outbox + Worker Delivery Active.
- **Deliverables**: Event outbox pattern implementation, BullMQ notification processors, email provider integration, in-app notification inbox UI.
- **Tasks**: Wire transactional outbox to domain events; build BullMQ email consumer with exponential backoff; create email templates for session scheduling/changes/reminders; build in-app notification bell & inbox UI.
- **Dependencies**: Phase 4, Phase 5.
- **Exit Gate**: Scheduling/rescheduling a session fires outbox events, enqueues BullMQ jobs, and delivers in-app + email notifications within agreed SLO via deterministic E2E worker draining.
- **Risks**: Email deliverability/spam flagging; mitigate with SPF/DKIM verification and rate limiting.

### Phase 8: Student Portal & Certificate Automated Gate (3–4 EW)

- **Objective**: Self-service portal for students to view schedule, attendance, ledger, payments, and certificates.
- **Status**: Current: Partial -> Target: Full Self-Service Complete.
- **Deliverables**: Student dashboard UI, Paymob direct payment action, automated certificate gate (`attendance >= 80% && balance == 0`), secure PDF download.
- **Tasks**: Build student overview (courses, schedule, attendance rates, financial balance); add online payment launch button; enforce automated certificate eligibility check; enable secure PDF download for eligible certificates.
- **Dependencies**: Phase 5, Phase 6.
- **Exit Gate**: Student with multiple enrollments sees isolated progress; certificate download is strictly blocked if attendance < 80% or balance > 0; allowed when criteria met.
- **Risks**: Edge cases in attendance calculation (e.g. excused sessions); mitigate with explicit versioned formula definition.

### Phase 9: Owner Analytics, Reporting & Audit Dashboards (2–3 EW)

- **Objective**: Operational and financial metrics for executive decision-making with freshness labeling.
- **Status**: Current: Partial -> Target: Complete Executive Dashboard.
- **Deliverables**: Owner dashboard with key metrics (students, active courses, sessions, revenue, outstanding receivables, attendance rate) featuring explicit freshness labels and reconciliation, drill-downs, CSV export.
- **Tasks**: Build KPI cards and trends UI with defined freshness indicators; create receivables aging & session attendance drill-down tables; implement secure, audit-logged CSV exports via BullMQ worker.
- **Dependencies**: Phase 6, Phase 8.
- **Exit Gate**: All metrics reconcile cleanly against exact underlying ledger/attendance source queries; exports execute asynchronously with non-root signed URLs.
- **Risks**: Slow aggregate queries on large datasets; mitigate with indexed read-models and cached dashboard summaries.

### Phase 10: Production Hardening, UAT, Cutover & Support (4–6 EW)

- **Objective**: Final security audit, controlled live transaction, UAT sign-off, data cutover, and post-launch support.
- **Status**: Current: Missing -> Target: Live Operational System.
- **Deliverables**: E2E automated suite, load test results, backup/restore runbook, controlled live Paymob verification, UAT sign-off, staged cutover plan, rollback protocol, recommended hypercare schedule.
- **Tasks**: Run full browser E2E test suite; conduct security threat review; test database disaster recovery; execute controlled live Paymob transaction; conduct UAT with Owner & staff; execute final historical data cutover (Excel -> System); provide recommended 2-week post-launch hypercare.
- **Dependencies**: Phases 0–9.
- **Exit Gate**: Zero P0/P1 bugs; 100% pass on `pnpm verify` AND `pnpm db:validate`; disaster recovery tested against Owner-approved RPO/RTO targets; formal sign-off from Owner; Excel sheets transitioned to read-only archive.
- **Risks**: Operational disruption during cutover; mitigate with parallel run staging and instant rollback protocol.

## 4. Requirements Traceability Matrix

|   # | Requirement Description                                  | Primary Phase | Target Acceptance Evidence                                  |
| --: | :------------------------------------------------------- | :-----------: | :---------------------------------------------------------- |
|   1 | Public student self-registration & Owner approval        |    Phase 2    | E2E registration, approval queue UI, audit log              |
|   2 | Auth via Email/Password & Phone/OTP                      |    Phase 2    | Rate-limited OTP generation, dual-identifier login tests    |
|   3 | Owner/Operations course & group management               |    Phase 4    | Role-guarded CRUD UI, permission matrix assertion           |
|   4 | Session scheduling, coordinator & conflict detection     |    Phase 4    | Calendar UI, room/trainer overlap rejection tests           |
|   5 | Schedule / reschedule notifications (in-app & email)     |    Phase 7    | Outbox event execution, SLO worker draining verification    |
|   6 | Stable signed student QR & staff session scanning        |    Phase 5    | HMAC QR generation, staff camera scanner E2E                |
|   7 | Attendance states: Present, Absent, Late, Excused        |    Phase 5    | Roster update API/UI, state transition test suite           |
|   8 | Close Attendance (unscanned -> Absent & session lock)    |    Phase 5    | Atomic close transaction test, post-lock mutation rejection |
|   9 | Owner/Operations audited attendance correction           |    Phase 5    | Reason-prompt UI, immutable audit trail assertion           |
|  10 | Accounts add-only ledger; Owner reversal/refund          |  Phase 2, 6   | Permission matrix enforcement, reversal transaction E2E     |
|  11 | Payment methods: Cash, InstaPay, V-Cash, Bank, Paymob    |    Phase 6    | Payment entry UI, Paymob sandbox webhook verification       |
|  12 | Flexible installment plans per enrollment                |    Phase 6    | Per-student schedule builder, balance math verification     |
|  13 | Certificate gate: Balance == 0 & Attendance >= 80%       |    Phase 8    | Eligibility boundary integration tests (79.9% vs 80.0%)     |
|  14 | Student portal: Courses, schedule, attendance, pay, cert |    Phase 8    | Student dashboard E2E, multi-course scope check             |
|  15 | Owner dashboard: Full admin & operational/revenue KPIs   |  Phase 4, 9   | Freshness-labeled KPI queries, drill-down verification      |
|  16 | Historical data migration from 3 sheets w/ auditability  |  Phase 3, 10  | 100% row lineage, zero unverified balance drift             |
|  17 | Support for multiple enrollments per student account     |  Phase 4, 8   | Shared identity with isolated enrollment progress           |

## 5. Data Migration & Reconciliation Strategy

- **Source Artifacts**: Master Sheet, Attendance & Cert., Annual Calendar - 2026. (927 valid rows, 114 sessions).
- **Process Pipeline**:
  1. _Ingest_: OOXML parser extracts raw evidence (sheet name, cell/row address, raw value, formula text, display value, Excel error metadata) into immutable staging tables.
  2. _Normalize_: Standardize payment methods (e.g., "Vodafone Cash" / "V.Cash"), clean phone numbers, parse Egyptian date formats.
  3. _Validate_: Flag missing attendance templates, broken references (`#REF!`, `#DIV/0!`), candidate room conflicts, and overpayments (24 identified cases).
  4. _Quarantine_: Isolate unresolvable rows into Data Steward quarantine tables with detailed error codes.
  5. _Promote_: Execute transactional domain entity creation with rerun-safe natural key hashes.
  6. _Reconcile_: Run source-vs-target automated reconciliation verifying total counts, financial ledger sums, attendance ratios, and certificate statuses.
  7. _Sign-off_: Require formal Owner sign-off on quarantine report before final cutover.

## 6. Quality & Testing Pyramid

- **Unit / Pure Logic**: Pricing schedule math, QR HMAC signature, attendance percentage rules.
- **Contract & API**: NestJS controller unit & HTTP contract tests covering all 178 routes.
- **Postgres Integration**: Real PostgreSQL container tests covering DB triggers, exclusion constraints, append-only rules, transaction isolation, advisory locks.
- **Browser E2E**: Playwright tests for critical user journeys (Registration, Scan Attendance, Paymob Checkout, Close Session).
- **Exact Repository Verification Commands**:
  - `pnpm format:check` — Prettier code formatting check.
  - `pnpm lint` — ESLint rules enforcement.
  - `pnpm typecheck` — TypeScript type checking across monorepo.
  - `pnpm test` — Vitest unit & contract test runner.
  - `pnpm build` — Production monorepo build via Turbo.
  - `pnpm db:validate` — Prisma schema validation.
  - `pnpm verify` — Combined check (`format:check && lint && typecheck && test && build`).
  - Full acceptance requires executing `pnpm verify` AND `pnpm db:validate`.

## 7. Development Workflow

- **Task Granularity**: Every engineering task is defined as a single, self-contained brief with bounded scope, explicit non-goals, and automated exit criteria.
- **Sequential Dependencies**: Tasks are executed in strict dependency order.
- **Implementation & Review**:
  - Develop changes in an isolated branch with a defined scope.
  - Review file diffs, untracked files, and changes to test expectations.
  - Verify the relevant checks before committing a completed change.
- **Rework Protocol**: Deficiencies trigger a targeted delta brief within the same context; no blind retries.
- **Final Coherence Check**: A comprehensive verification sweep is performed across code, schemas, docs, and tests upon milestone completion.

## 8. Effort Estimates & System Boundaries

- **Total Estimated Effort**: 34 – 50 Engineer-Weeks (EW).
- **Operational Replacement MVP Boundary**: Phases 0 through 9 (approx. 30–44 EW). Completing Phase 9 delivers all core user requirements (Operations, Attendance, Accounts, Notifications, Student Portal, Analytics) for complete operational replacement of Excel sheets. (Note: Phases 0–6 represent an internal pilot boundary for early internal trial, not complete system replacement).
- **Production Hardening & Cutover Boundary**: Phase 10 (approx. 4–6 EW). Required for live cutover, final disaster recovery testing, and hypercare support.
- **Key Assumptions**: Single dedicated senior engineer equivalent; standard staging environment with live Postgres/Redis; prompt Owner availability for data steward decisions.

## 9. Definition of Done (DoD)

A task is marked **DONE** only when:

1. Scope criteria specified in the brief are 100% satisfied.
2. All modified and created files comply with the ≤300 physical lines rule (verified by CI true physical line counting).
3. No existing tests were skipped, disabled, or weakened.
4. Happy path and negative authorization/validation paths have passing automated test coverage.
5. All verification commands (`pnpm verify` AND `pnpm db:validate`) pass with 0 errors.
6. Git diff contains zero extraneous code, scratch files, or scope creep.
7. Documentation and API schemas are updated to reflect changes.

## 10. Initial Implementation Task Queue (Tasks 1–8)

1. **Task 1: Environment & Secret Configuration Hardening** (Phase 0) — Align `API_ORIGIN` vs `API_INTERNAL_URL` and add missing CI secret contracts (`PASSWORD_RESET_PEPPER`, `ACTION_TOKEN_ENCRYPTION_KEY`).
2. **Task 2: Repository Prettier Baseline Standardization** (Phase 0) — Run repo-wide code formatting fix and verify `pnpm format:check` passes without modifying logic.
3. **Task 3: Physical Line-Count Audit Script & CI Warning** (Phase 0) — Create lightweight `max-lines` checking script using true physical line count (including blanks) that logs warnings for maintained files >300 lines.
4. **Task 4: Shared Real-DB Test Harness & Finance Contract Extraction** (Phase 1) — Extract shared Postgres test setup and move Finance assertions from `postgres-contract.integration.test.ts` (1,812 lines) into a dedicated suite (<300 lines).
5. **Task 5: Modularize Prisma Schema Core Domain Slice** (Phase 1) — Modularize `schema.prisma` (1,331 lines) into domain schema files starting with Identity & CRM slices using verified multi-file schema support; verify with `pnpm db:validate`.
6. **Task 6: Decompose Finance Mutation Service** (Phase 1) — Split payment posting, allocation, and reversal commands from `finance.service` (1,397 lines) into a dedicated command service (<300 lines).
7. **Task 7: Decompose Finance Query & Read Service** (Phase 1) — Extract financial aging, ledger reads, and derived balances from `finance-read.service` into a dedicated read service (<300 lines).
8. **Task 8: OpenAPI Response-Schema Slice for Auth & IAM** (Phase 1) — Add NestJS OpenAPI response annotations for Auth/IAM endpoints and update generated client types for that slice.

## 11. Governance & Decisions Required Before Feature Phases

- **Auth Provider Details**: Selection of SMS gateway vendor for OTP delivery & email provider for transactional outbox.
- **Paymob Production Configuration**: Merchant Integration IDs, secret keys, HMAC keys, fee handling policies.
- **Attendance Policy Definitions**: Late arrival threshold window, weight of Excused absences in certificate formula.
- **QR Token Revocation Policy**: Student QR expiration timeframe & manual offline verification policy.
- **Disaster Recovery Targets**: Owner-approved RPO and RTO parameters for backup/restore verification.
- **Historical Overpayment Resolution**: Business rule for handling the 24 historical student overpayment cases during migration promotion.
- **Calendar Data Gaps**: Standard default assumptions for missing year, end-time, or coordinator in historical calendar rows.
