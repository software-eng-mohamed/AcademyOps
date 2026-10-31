# AcademyOps browser acceptance suite

This suite covers the authenticated Owner, Accounts, Attendance, and Student dashboards plus
anonymous authentication failures, CSRF enforcement, server-side role isolation, and authenticated
Socket.IO reconnect and ticket-replay rejection. It also creates a name-only synthetic student
through the interface and verifies persistence; it does not send messages or submit payments.

## Safety boundary

The default target is the acceptance UI at `http://127.0.0.1:3101`. A non-loopback URL is rejected unless both
`E2E_ALLOW_REMOTE=synthetic-only` and an exact-origin `E2E_TARGET_ALLOWLIST` are set. Only disposable
synthetic organizations and accounts may be used. Never supply production credentials or a real
student workbook.

Credentials come from the marker-verified ignored artifact (optional environment values may
override an account only after that marker exists). Playwright state is written below
`test-results/e2e/.auth`. Traces, screenshots, and videos are retained only on failure. API evidence
omits query values, bodies, cookies, and headers, and redacts identifiers from browser errors.

## Deterministic fixture contract

Run the guarded fixture command against the disposable database. It creates only the fixed
`E2EACADEMY` organization and twelve accounts; it never reads a workbook or real user data:

```bash
export E2E_FIXTURE_CONFIRM=synthetic-only
export E2E_BASE_URL='http://localhost:3130'
export MFA_ENCRYPTION_KEY='same-32+-character-key-used-by-the-test-api'
pnpm e2e:fixture:seed
pnpm e2e:fixture:verify
```

The generated passwords and TOTP seeds are written with mode `0600` to the Git-ignored
`test-results/e2e/fixtures/credentials.json`. Values are random on first creation and reused on
idempotent reruns. They are never printed. Playwright reads this artifact automatically.
Set `E2E_CREDENTIALS_FILE` when a separate fixture needs its own artifact; the seed and browser
suite both accept an absolute path or a path relative to the repository root.

The fixture contains these accounts:

- `OWNER`: organization-wide owner grants including `reports.operations.read` and `imports.preview`.
- `ACCOUNTS`: finance reporting/read and payment-recording grants, with no owner/import grants.
- `ATTENDANCE`: attendance read/write grants, with no finance or owner/import grants.
- `STUDENT`: student-scoped enrollment and attendance grants, with at least two enrollments.
- `OPERATIONS`: academic operations grants for additional workflow coverage.
- `ACADEMIC`, `RECEPTION`, `SALES`, `TRAINER`, and `OTP_OPERATOR`: their respective role workspaces.
- `NO_GRANT`: active user without grants, expected to land on the access dashboard.
- `FIRST_LOGIN`: operations user with password-change/onboarding gates intentionally enabled.

Normal dashboard accounts have completed onboarding, an explicit locale, and stable credentials;
`FIRST_LOGIN` deliberately keeps password-change and onboarding gates. Staff accounts use generated
Base32 TOTP secrets. The fixture also contains one branch, two active cohorts, upcoming/past sessions,
installments, posted payments, and attendance rows.

Cleanup is intentionally more difficult than creation and deletes only the marker-verified synthetic
organization. Because immutable audit/finance triggers must be bypassed inside one rollback-safe
transaction, the cleanup connection must use a PostgreSQL maintenance role. It also removes the
ignored credential artifact:

```bash
export E2E_FIXTURE_CLEAN_CONFIRM=delete-E2EACADEMY
pnpm e2e:fixture:clean
```

## Commands

```bash
pnpm e2e:install
pnpm e2e:lint
pnpm e2e:typecheck
pnpm e2e:fixture:typecheck
pnpm e2e:list
pnpm e2e
pnpm e2e:roles
pnpm e2e:report
```

`pnpm e2e:list` is safe without credentials or a running server. A full run intentionally fails with
a clear missing-variable message until the fixture is configured. `pnpm e2e:roles` adds the
live workspace, attendance, WhatsApp management, and bilingual responsive visual checks.
Both commands use `E2E_BASE_URL` and require the API and web app to be running against
the same disposable database.
