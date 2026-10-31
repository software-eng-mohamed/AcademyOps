# Interactive demo

**[Open AcademyOps on Vercel](https://academyops-demo.vercel.app)**

The portfolio deployment runs the **existing AcademyOps frontend**: its sign-in screen,
dashboard, navigation, tables, forms, Arabic/English layouts, and themes. It uses an internal
mock API with the same endpoint paths and response shapes as the NestJS application.

The demo does not require PostgreSQL, Redis, or a separately hosted backend. The full application
remains available in this repository and continues to use the real API when demo mode is off.

## Signing in

The original sign-in form is prefilled in demo mode:

| Field        | Public sample value     |
| ------------ | ----------------------- |
| Organization | `ACADEMYOPS`            |
| Email        | `owner@academyops.demo` |
| Password     | `AcademyOps-Demo-2026!` |

These are fictional demonstration credentials, not credentials for a real academy.

## Data and behavior

All learners, staff, courses, financial records, and documents are synthetic. Read requests and
supported changes go to Next.js route handlers under `/api/v1`. Server-rendered pages call the
same mock handler directly, so the original authentication and dashboard flows remain intact.

Each visitor's changes are stored as a bounded event journal in a browser cookie. The server
reconstructs a fresh sample academy for each request; it does not share mutable data between
visitors or depend on a warm serverless process. Changes survive reloads for up to 24 hours.
Use **Reset demo** in the existing workspace to restore the sample records. The journal supports
up to 24 changes within a 3,600-character cookie; the interface explains when a reset is needed.

The demo simulates local academy workflows. Payment gateways, email, WhatsApp delivery, account
recovery, and uploading real files require the full backend and configured providers. Those
actions return an explicit explanation instead of claiming that a real operation succeeded.
Sample certificate PDFs are marked as fictional demonstrations. Analytics are omitted.

## Run locally

Use the Node.js and pnpm versions pinned in the repository. From the repository root, in PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @academyops/contracts build
pnpm --filter @academyops/api-client build
pnpm --filter @academyops/ui build
$env:ACADEMYOPS_DEMO_ONLY = 'true'
$env:NEXT_PUBLIC_POSTHOG_ENABLED = 'false'
pnpm --filter @academyops/web exec next dev --hostname 127.0.0.1 --port 3100
```

Open `http://127.0.0.1:3100`. Leave `ACADEMYOPS_DEMO_ONLY` unset for the normal application.

## Vercel settings

| Setting                    | Value                            |
| -------------------------- | -------------------------------- |
| Framework                  | Next.js                          |
| Root directory             | `apps/web`                       |
| Include files outside root | Enabled                          |
| Node.js                    | `22.x`                           |
| Install command            | `pnpm install --frozen-lockfile` |
| Build command              | `cd ../.. && pnpm build:web`     |
| Output directory           | Next.js default                  |

Set these variables for both Production and Preview before building:

```text
ACADEMYOPS_DEMO_ONLY=true
NEXT_PUBLIC_POSTHOG_ENABLED=false
NEXT_PUBLIC_QUERY_DEVTOOLS=false
ENABLE_EXPERIMENTAL_COREPACK=1
```

Corepack selects the pnpm version in the root `package.json`. No database or external provider
credentials belong in this deployment. See [Deployment](deployment.md) for the full system.

## Verification

Unit tests cover the API contract, authentication, cookie serialization during server rendering,
visitor isolation, persistence, input limits, state transitions, and routing to the real backend
when demo mode is disabled. The browser suite uses the original UI and actual internal API.

On 31 October 2026, the complete web unit suite passed 929 tests. All 9 browser scenarios also
passed against the public production URL with zero retries, failures, flaky results, or skipped
cases. They cover sign-in and server rendering, navigation, student and lead changes, notification
persistence, visitor isolation, and English/Arabic desktop/mobile layouts in both themes.

With a demo server already running, run this in a second PowerShell terminal:

```powershell
$env:ACADEMYOPS_DEMO_ONLY = 'true'
$env:WEB_BASE_URL = 'http://127.0.0.1:3100'
$env:WEB_USE_RUNNING_SERVER = 'true'
pnpm web:e2e current-demo.spec.ts --workers=1
```
