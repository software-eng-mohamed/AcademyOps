# Verification record

Local checks completed on **31 October 2026** with synthetic data and the runtime configuration
listed below.

## Environment

- Windows, Node.js 24.16, pnpm 11.25, PostgreSQL 17.10 and Redis 8.10.3.
- Separate disposable databases for backend tests, live browser acceptance and load testing.
- Chromium against a production-built Next.js standalone server and a real NestJS API.
- The API used isolated test configuration and synthetic tenant records.
- Test-only signing keys, generated credentials and loopback service endpoints.

The repository pins pnpm 11.16 and supports Node.js 22.12 or newer. The Linux CI workflow
provides a separate check of its pinned environment.

## Completed local checks

| Area                                | Result                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API                                 | 738 unique tests passed, including PostgreSQL/Redis integration, the opt-in Chromium test, packaging and fixture-isolation regressions                   |
| HTTP contract matrix                | All 221 OpenAPI operations exercised twice: 442 successful invocations                                                                                   |
| Web unit tests                      | All 857 tests passed in the complete AcademyOps suite                                                                                                    |
| Shared packages                     | API client 106, UI 19, contracts 15 and OTP connector 11 tests passed                                                                                    |
| Verification tooling                | Source-line gate 30, load tooling 16, journey and secret-generator regressions 14, and development readiness 5 tests passed                              |
| Mock browser suite                  | 20 scenarios passed against the loopback fixture API                                                                                                     |
| Live browser acceptance             | All 20 tests passed after the rebrand: real form login, permissions, CSRF and authenticated realtime tickets; zero retries or skipped tests              |
| Live roles and workspaces           | All 26 scenarios passed after the rebrand: persisted student creation, current owner pages, all role workspaces, attendance and read-only channel status |
| Responsive and accessibility checks | 132 language/theme/viewport captures and 25 Axe scans passed with no violations; workspace titles and visible branding were also checked                 |
| Build                               | API, worker, web and OTP connector built successfully; the Next.js standalone server served live acceptance tests                                        |
| Production packaging                | API, worker and OTP production deploys passed; generated Prisma clients, native Argon2, worker imports and the patched Puppeteer runtime were exercised  |
| Generated API                       | Regeneration produced no contract drift; 191 paths and 221 operations checked                                                                            |
| Source checks                       | Formatting, dependency pinning, source-line limits, lint and TypeScript checks passed                                                                    |
| Dependency audit                    | No known production npm advisories, with no ignored advisory IDs; production license checks passed                                                       |

The live browser suites use generated fixture accounts. The persisted student test creates
a name-only record without contact details. All eight screenshots in `docs/images/` were
recaptured from the final AcademyOps production build and synthetic database, including the
new login mark, mobile header, English/Arabic layouts and both themes. Their figures are not
business results. The live suites completed without retries, flaky results or skipped tests.

## Repository recreation

The hosted results below belong to the previous GitHub repository instance. Its run IDs,
commit IDs and alert numbers are preserved as historical identifiers. Fresh CI, Browser
acceptance, Security and OTP image checks for the recreated repository are pending, including
a new CodeQL analysis and review of its resulting alerts.

The pre-recreation review removed the three historical OpenSSL exclusions from `.trivyignore`.
The exact recorded backend/web runtime contained `libssl3t64` version `3.5.7-1~deb13u3`, and
the OTP runtime installed OpenSSL `3.0.22-1~deb12u2`. Debian marks those versions fixed for
[CVE-2026-31790](https://security-tracker.debian.org/tracker/CVE-2026-31790),
[CVE-2026-45447](https://security-tracker.debian.org/tracker/CVE-2026-45447) and
[CVE-2026-34182](https://security-tracker.debian.org/tracker/CVE-2026-34182).
This package-version check is separate from a fresh image vulnerability inventory; the new
image gates must run with no CVE IDs excluded.

## Historical Linux CI

All four hosted workflows passed for implementation commit
`3d1b664141fec8fa70791e07cbef17d081941bd9` in the previous repository instance.
These results apply to that exact historical revision.

| Workflow and former run ID          | Recorded result                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI — `41219812512`                  | Code, schema, contract and dependency gates; automated tests; production builds; container runtime checks; Compose/Caddy validation; and signed release provenance passed. |
| Browser acceptance — `41219812523`  | Real API Chromium integration passed (1 test), followed by all 20 localized UI/navigation scenarios.                                                                       |
| Security — `41219812516`            | Full-history Gitleaks and all six Semgrep scopes passed.                                                                                                                   |
| OTP connector image — `41219812521` | Isolated image build, non-root runtime assertion, vulnerability inventory and blocking gate passed.                                                                        |

The main test job passed 737 API tests; its one opt-in browser case was skipped there and
passed separately in Browser acceptance.

CodeQL was skipped because the previous repository was private during this recorded run;
dependency review runs on pull requests. Current analyses will be listed in the
[Security workflow](https://github.com/software-eng-mohamed/AcademyOps/actions/workflows/security.yml).

The backend and web image inventories each reported **24 medium OS package findings**, with
no high or critical findings. The OTP image reported **2,529 OS package findings**: 2,047
medium, 462 high and 20 critical. The Node-package tables reported no findings. These counts
reflect the historical Trivy exclusions (`CVE-2026-45447`, `CVE-2026-31790` and
`CVE-2026-34182`) and can list the same CVE against several packages; they are not counts of
unique vulnerabilities. All blocking scans in those recorded runs returned zero findings with
`ignore-unfixed: true`; that gate does not mean the images have no known vulnerabilities.

## Historical public CodeQL review

The previous repository's first public Security run, `41221276065`, reported 11 CodeQL alerts
on commit `366a0965d545213d071955946cae9eb5b5408819`.
The confirmed secret-output issue was corrected in both cluster-secret generators. Two isolated
regression tests execute the actual scripts and check that generated credentials stay out of
stdout and stderr. Together with journey guards, all 14 tests passed locally; the five development
readiness tests also passed through `pnpm test:scripts`.

The other ten alerts were reviewed as `not_actionable` for the inspected call paths and shipped
deployment settings. The numbers below belong to that previous repository instance:

| Former alert IDs | Recorded boundary evidence                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                | The shipped HTTPS deployment enables Content Security Policy.                                                                                                                                  |
| 2, 3, 4          | Uploads use scoped UUID keys and server-computed hashes; local paths are confined to the storage root, and production uses R2.                                                                 |
| 6, 7             | The hashes protect random 256-bit tokens or 80-bit recovery tokens with a pepper; actual passwords use Argon2id.                                                                               |
| 8                | The value is a test token.                                                                                                                                                                     |
| 9, 10            | Developer-tool pathname races exist, with no established privilege boundary in their supported callers.                                                                                        |
| 11               | The authorized certificate-upload endpoint stores bounded, validated and malware-scanned PDF bytes under a server-derived private key; the original filename does not select the storage path. |

The previous repository's post-fix Security run, `41222676662`, passed on commit
`6ece3e39ceca6194136ff322852a685209292bce`:
both real-generator tests ran on Ubuntu, including the `0600` assertions; full-history Gitleaks,
all six Semgrep scopes and CodeQL passed. In that repository, CodeQL marked alert 5 fixed. The other ten were closed
with recorded review reasons: seven false positives, one test-only value and two local-tool races
accepted for the inspected callers. No scan rules or exclusions were weakened during that review.
These alert IDs and dispositions do not carry over to the recreated repository.

These decisions apply to the reviewed configuration. Local path containment is lexical, not
protection against pre-existing symlinks; no remote link-creation path was found. Shared,
attacker-writable storage or privileged execution of developer tools needs a separate review.

## Local load smoke

The six-minute profile used **10 HTTP virtual users and 10 realtime connections** together,
against a separate database containing **10,500 synthetic subjects**. Both workloads and their
combined gate passed with the checked-in thresholds unchanged.

| Measurement                | Result                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| HTTP requests / iterations | 3,848 / 1,924                                                      |
| HTTP checks                | 5,772 passed; no failed or invalid responses                       |
| Simple reads               | p95 69.8 ms; p99 263.1 ms                                          |
| Dashboard reads            | p95 1,118.8 ms; p99 1,180.8 ms                                     |
| Realtime connections       | 10/10 connected and maintained                                     |
| Realtime resync            | p95 and p99 31.7 ms; no invalid messages or authorization failures |

These results describe a local run at ten concurrent users, with the generator and API on the
same machine. Higher staged profiles remain unmeasured.

## Scope boundaries

Docker image builds and genuine Linux/root/systemd deployment checks cannot run in the local
Windows environment. Shell syntax and application packaging were checked locally; Linux CI
performs the platform-specific checks separately. Local Git Bash could not exercise the backup
retention test because native symlink creation was unavailable. Check the
[Linux CI workflow](https://github.com/software-eng-mohamed/AcademyOps/actions/workflows/ci.yml)
for image builds, platform checks and their recorded results.

No real payment, WhatsApp pairing, email delivery, cloud storage transaction, production restore
or production user data was used. SMTP verification compiled mail in memory, and the Puppeteer
smoke used an isolated local page. Provider credentials, delivery guarantees and disaster recovery
still require validation in the intended deployment environment.

Historical harnesses for superseded frontend implementations were archived locally. They are
not counted as passing tests or presented as current coverage. The maintained commands and
their scopes are listed in [tests/README.md](../tests/README.md).
