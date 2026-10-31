# Verification record

Local checks completed on **31 October 2026** with synthetic data and the runtime configuration
listed below.

## Original-interface demo

The optional portfolio deployment keeps the existing frontend and replaces its remote API
with an isolated internal mock. The complete web unit suite passed **929 tests in 94 files**
after this integration. The production Next.js build, TypeScript, generated API boundary check,
formatting and source-line gates passed. Focused regressions cover server-rendered sessions,
visitor isolation, bounded cookie persistence, original form contracts and domain transitions.
All **9 original-interface browser scenarios** passed together with zero retries, failures,
flaky results or skipped cases. They cover login and logout, every owner navigation page,
student and lead mutations, notification persistence, visitor isolation, and English/Arabic
desktop/mobile layouts in both themes. Eight screenshots were captured from that run.

The publication export contained no secret-scan findings or private deployment artifacts.
The hosted demo uses synthetic data and does not run the database, workers or external providers.
Its configuration and supported scope are documented in [Interactive demo](demo.md).

## Environment

- Windows, Node.js 24.16, pnpm 11.25, PostgreSQL 17.10 and Redis 8.10.3.
- Separate disposable databases for backend tests, live browser acceptance and load testing.
- Chromium against a production-built Next.js standalone server and a real NestJS API.
- The API used isolated test configuration and synthetic tenant records.
- Test-only signing keys, generated credentials and loopback service endpoints.

The repository pins pnpm 11.16 and supports Node.js 22.12 or newer. The Linux CI workflow
provides a separate check of its pinned environment.

## Completed local checks

The following results record the full-application baseline before the optional mock API was added.
These Windows measurements complement the separate Linux baseline checks recorded below.

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

## Hosted full-application baseline

All four hosted workflows passed for release commit
[`44f1bb94234c322a825441457d46139756b037a2`](https://github.com/software-eng-mohamed/AcademyOps/commit/44f1bb94234c322a825441457d46139756b037a2)
in the current repository.

| Workflow                                                                                           | Recorded result                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CI](https://github.com/software-eng-mohamed/AcademyOps/actions/runs/41225173123)                  | Passed: tests, lint, types, schema and 221-operation contract gates, production image checks and all seven production build tasks.                                     |
| [Browser acceptance](https://github.com/software-eng-mohamed/AcademyOps/actions/runs/41225173090)  | Passed: 1 real API Chromium integration test and all 20 UI scenarios.                                                                                                  |
| [Security](https://github.com/software-eng-mohamed/AcademyOps/actions/runs/41225172996)            | Passed: Gitleaks scanned the single-commit history; all six Semgrep scopes, both Linux secret-generator tests and the 103-rule CodeQL analysis completed successfully. |
| [OTP connector image](https://github.com/software-eng-mohamed/AcademyOps/actions/runs/41225173183) | Passed: isolated image build, non-root runtime assertion, vulnerability inventory and blocking gate.                                                                   |

The main test job passed 737 API tests; its opt-in browser case passed separately in Browser
acceptance. Both real-generator regressions check that generated credentials remain absent from stdout
and stderr; the Linux run also passed the `0600` file-mode assertions. Dependency review is
reserved for pull requests.

The image inventories excluded no vulnerability IDs; `.trivyignore` contains no ID exclusions.
The API/backend and web images each reported **24 medium OS package findings**, with no high
or critical findings. The OTP image reported **2,529 OS package findings**: 2,047 medium,
462 high and 20 critical. All Node-package tables reported zero findings. A CVE can appear
against several packages, so these are package findings rather than unique vulnerabilities.
All blocking scans returned zero findings with `ignore-unfixed: true`, which omits findings
without an available fix; that passing gate does not mean the images have no known vulnerabilities.

## CodeQL review and evidence boundaries

CodeQL analysis `2068970570` reported ten previously reviewed findings. Their rule, path and
line matched the prior review, and exact Git-blob comparisons confirmed identical affected
source files. The findings were closed with recorded reasons: seven false positives, one
test-only value and two developer-tool pathname races accepted for the inspected callers.
The corrected secret-output issue was absent. No scan rules were weakened to obtain these results.

The review covers the shipped HTTPS/CSP configuration, scoped UUID upload keys with
server-computed hashes, random token hashes and Argon2id password hashing. Authorized PDF
uploads store bounded, validated and malware-scanned bytes under a server-derived private
key; the original filename does not choose the storage path. Local path containment is lexical
and does not protect against pre-existing symlinks. No remote link-creation path or supported
privilege boundary for the local-tool races was found. Shared attacker-writable storage,
privileged tool execution or changed deployment settings require reassessment.

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
