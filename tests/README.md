# Test suites

Run commands from the repository root. Each browser suite has an explicit Playwright
configuration; use the scripts below to select the intended environment.

| Suite                       | Command             | Scope                                                                                                                          |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Mocked web acceptance       | `pnpm web:e2e`      | Current Next.js interface, authentication states, navigation, responsive layouts and charts against a loopback fixture API     |
| Live acceptance             | `pnpm e2e`          | Real browser login, scoped dashboards, permissions, CSRF, persisted student creation and authenticated Socket.IO tickets       |
| Live role and visual checks | `pnpm e2e:roles`    | Role workspaces, current owner pages, attendance, read-only WhatsApp status, both languages/themes, responsive layouts and Axe |
| Load tooling checks         | `pnpm load:verify`  | Workload configuration, fixture boundaries and staged gate logic                                                               |
| Script regressions          | `pnpm test:scripts` | Journey guards, both cluster-secret generators and development server readiness                                                |

For live suites, start the API and web app against a disposable database, seed the
marker-verified fixture, and set `E2E_BASE_URL` to the web origin. The API's `WEB_ORIGIN`
must match it exactly, including hostname and port. Set `E2E_FIXTURE_CONFIRM=synthetic-only`.
The realtime acceptance test also needs the API socket origin in `E2E_REALTIME_URL` or
`NEXT_PUBLIC_REALTIME_URL`.

The live tests create only synthetic student records without contact details. They do not
pair WhatsApp devices, send messages, submit payments or operate on a production tenant.
Images, credentials, browser state and reports are written below the ignored `test-results/`
directory. Selected screenshots in `docs/images/` are presentation assets, not visual baselines.

See [live fixture setup](e2e/README.md) and [staged HTTP/realtime load tests](load/README.md)
for the required service configuration and guards. Package-level unit and integration
tests run through `pnpm test`; they have separate database and Redis requirements.

The two secret-generator regressions execute the real Node.js and shell scripts in isolated
temporary directories. They check generated credentials, matching connection settings and the
absence of secret values from stdout and stderr. Windows uses Git Bash for the shell variant;
the `0600` file-mode assertion also passed in the previous repository instance's Ubuntu Security
workflow. Fresh hosted checks for the recreated repository are pending.
The recorded local result is 14 journey/generator tests and five development readiness tests
passed. See the [verification record](../docs/verification.md) for the CodeQL review and its scope.
