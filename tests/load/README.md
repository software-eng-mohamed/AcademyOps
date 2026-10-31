# Production-safe staged load harness

This directory contains a read-only authenticated HTTP workload for k6 and a Node
`socket.io-client` workload for Engine.IO v4 websocket-only realtime. Nothing runs automatically.
The default target is `http://127.0.0.1:3100`; every remote run is locked to a disposable synthetic
tenant and an exact origin.

## What is exercised

- HTTP traffic uses 94% student, 3% attendance, 2% accounts, and 1% owner at 100+ users. The 10-user
  smoke keeps at least one user in every role, so its split is intentionally 70/10/10/10.
- Each iteration verifies `/api/v1/auth/me` is still `E2EACADEMY` with the `SYNTHETIC E2E` marker,
  then reads a role-appropriate dashboard API. There are no logins during load.
- Realtime obtains one short-lived CSRF-protected ticket per pre-seeded session, connects with
  websocket-only Socket.IO, validates resync messages, and measures connection and maintenance rate.
- Business mutations, Paymob, attendance writes, OTP, and email are excluded. They need a separate
  disposable-data canary with reconciliation and cleanup; they are never enabled by an environment
  typo here.
- IAM Staff & Access routes are covered by browser and full HTTP suites, not this sustained mix.
  Their `users.manage` permission deliberately requires a fresh MFA step-up, while load artifacts
  contain no TOTP or login credentials. The Owner rotation uses the non-step-up program catalog read
  instead so long profiles do not weaken or outlive the ten-minute step-up policy.

## Hard safety contract

All authenticated runs require a session artifact matching `session-artifact.schema.json`. Runtime
validation is stricter than the schema: the target origin and runner coordinates must match, the
fixture marker must be `plg-synthetic-e2e-v1`, the organization must be `E2EACADEMY`, subjects must
be unique, sessions must be unexpired, and PII/login fields or the `Janna` marker are rejected.

The artifact belongs in the ignored `test-results/load/` directory with mode `0600`; never commit or
paste it into logs. It contains only already-issued cookies for unique synthetic subjects. The
guarded load fixture extends the small E2E seed with 10,500 unique synthetic users and hashed server
sessions, then writes one runner-sharded artifact. Every load student gets one active cohort
enrollment, two attendance records, a three-installment approved schedule with balanced debits, and
one in three gets a posted payment/allocation. It creates no passwords, login identifiers, emails,
or phone numbers. Each runner uses one unique role-matched session per virtual user.
Dynamic UUIDs and query values are also removed from k6 metric names, and URL system tags are
disabled, so summaries and exported metric labels do not disclose fixture identifiers.

For any non-local target all of these must match:

```text
E2E_LOAD_REMOTE=synthetic-only
E2E_LOAD_BASE_URL=https://synthetic-stage.example.test
E2E_LOAD_ALLOWED_ORIGIN=https://synthetic-stage.example.test
```

An origin with a path, wildcard, alternate port, or different scheme is rejected. The harness does
not have a switch that permits a real tenant.

## Profiles and gates

| Profile | Ramp | Hold | Cooldown | Minimum external runners |
| ------: | ---: | ---: | -------: | -----------------------: |
|      10 |  30s |   5m |      30s |                        1 |
|      50 |   1m |  10m |       1m |                        1 |
|     250 |   2m |  15m |       2m |                        1 |
|    1000 |   5m |  20m |       5m |                        1 |
|    2500 |   7m |  20m |       7m |                        2 |
|    5000 |  10m |  30m |      10m |                        2 |
|    7500 |  12m |  30m |      12m |                        4 |
|   10000 |  15m |  60m |      15m |                        4 |

Run generators outside the target VPS. Profiles above 1000 refuse insufficient runner counts. The
documented emergency override is `E2E_LOAD_SINGLE_RUNNER_OVERRIDE=acknowledge-resource-risk`; it
only bypasses generator-count protection, never target or tenant protections.

Every profile after 10 requires `E2E_LOAD_PREVIOUS_GATE` from the immediately smaller profile. A
gate passes only when sanitized HTTP and realtime summaries from every configured runner pass. This
prevents skipping from smoke directly to 10k. Gates are bound to the deployed Git revision and
target origin, and expire after six hours by default (configurable from 1 to 1,440 minutes).

Use one runner through profile 1000, two through 5000, and four for 7500/10000. When increasing the
runner count, run the guarded fixture cleanup and seed again so it produces correctly sharded
artifacts, then verify the new fixture before continuing. The immediately previous fresh gate stays
valid only when the target origin and deployed revision have not changed.

## Commands

Install k6 on each external generator and prepare its runner-specific session artifact. Then set the
variables in `env.example` using the runner's secret environment, not a tracked file.
Run the commands below from the repository root. Relative session-artifact and previous-gate paths
are resolved from that root; absolute paths are also accepted.

First run the ordinary deterministic E2E seed on a disposable database. The load fixture refuses to
run unless that database contains exactly one organization, whose exact marker is `E2EACADEMY`, and
the deployed Git revision, target origin, runner count, API `SESSION_PEPPER`, and confirmations are
set. `verify` recomputes every cookie hash and reconciles all 10,500 DB sessions. `clean` removes only
`LOAD-*` people and their dependent domain/identity rows, then deletes only
`sessions-r<number>.json` files. Because production finance rows are intentionally append-only, the
cleanup requires a PostgreSQL role allowed to set `session_replication_role` and does so only inside
one transaction after all disposable-tenant confirmations pass; discard the whole test database if
that privilege is intentionally unavailable.

```bash
pnpm e2e:fixture:seed
pnpm load:fixture:seed
pnpm load:fixture:verify
```

```bash
pnpm load:verify
pnpm load:list
pnpm load:prepare
pnpm load:http
pnpm load:realtime
pnpm load:gate -- test-results/load/results/http-10-r0.json \
  test-results/load/results/realtime-10-r0.json
```

`load:http` runs `load:prepare` automatically so k6 can write its repository-root-relative summary.
The standalone prepare command is useful when validating a new external runner before a stage.

Repeat the HTTP and realtime suites on every runner. Copy only their sanitized summaries to the
gate operator. The combined file is written to `test-results/load/gates/gate-<profile>.json`.
After testing, set the separate clean confirmation and run `pnpm load:fixture:clean` before the E2E
fixture/database teardown.

## Automated SLO and stop conditions

- Simple API reads: p95 <= 400 ms and p99 <= 1 s.
- Dashboard overview: p95 <= 1.5 s and p99 <= 3 s.
- HTTP errors and invalid responses: each below 0.1%; checks above 99.9%.
- Any 401/403, tenant mismatch, malformed ticket, or malformed realtime message: stop.
- Realtime initial connections >= 99.5%; maintained samples >= 99.9%.
- Realtime resync delivery p95 <= 2 s and p99 <= 5 s.

k6 thresholds abort on sustained HTTP failure. The realtime runner aborts on authorization failure
or a severe early connection collapse and exits non-zero on any SLO failure.

Operators must also stop a stage if readiness fails, 5xx exceeds 0.1%, target CPU is sustained above
70%, memory above 75%, file descriptors above 70%, DB pool usage above 80%, or Redis evicts/fails
writes. These need the VPS Prometheus/Grafana dashboards; the load generator deliberately cannot
override target-side monitoring.

## Honest limits

The realtime test measures the server's initial `realtime:resync` path and connection survival.
Read-only safety means it cannot measure domain invalidation delivery without an external synthetic
canary publisher. A 10,000 profile result is valid only after the guarded 10,500-subject fixture was
verified and enough independent external generators completed both suites. Run backup/restore
validation, E2E role journeys, and security scans before this harness. The fixture intentionally
does not create invoices, receipts, refunds, certificates, gateway attempts, or per-student course
variety, so this proves neither those workflows nor write capacity.
