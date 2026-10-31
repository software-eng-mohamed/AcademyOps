# Deploying the web app on Vercel

This repository contains a Next.js frontend and a separate NestJS API. A Vercel frontend needs a reachable API, with PostgreSQL, Redis, storage and the worker provisioned separately. These notes describe the checked-in configuration; they are not evidence of a verified Vercel deployment.

## Build configuration

The root [vercel.json](./vercel.json) declares:

| Setting          | Value                |
| ---------------- | -------------------- |
| Framework        | Next.js              |
| Build command    | `pnpm run build:web` |
| Output directory | `apps/web/.next`     |

These paths assume the repository root is the build working directory. `build:web` builds the shared contracts, API client and UI packages before `apps/web`. Use the Node.js requirement and pinned pnpm version in [package.json](./package.json), and install with `pnpm install --frozen-lockfile`.

When importing the repository, review the project's Root Directory together with these paths. If you select `apps/web` as the Root Directory, the build command must still build its workspace dependencies and the output path becomes `.next`; the root configuration cannot be copied unchanged. Vercel documents these controls in its [monorepo guide](https://vercel.com/docs/monorepos) and [project configuration reference](https://vercel.com/docs/project-configuration).

## Frontend environment

Configure values for the intended Preview or Production environment before building. The domains below are examples.

| Variable                | Example                           | Purpose                                                                                                           |
| ----------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `API_ORIGIN`            | `https://api.example.test`        | Backend origin, without a path.                                                                                   |
| `API_INTERNAL_URL`      | `https://api.example.test/api/v1` | Backend API base URL. When provided, it takes precedence over `API_ORIGIN` for both server requests and rewrites. |
| `WEB_ORGANIZATION_CODE` | `ACADEMYOPS`                      | Existing organization code used by the login and password-reset forms.                                            |

For an existing installation, use its persisted organization code. The configured backend must be reachable from Vercel. Do not copy a local Docker service name or loopback URL into a hosted environment.

[Next.js configuration](./apps/web/next.config.ts) rewrites browser requests under `/api/v1` to the backend. Server Components use the same [API environment resolver](./apps/web/src/api/server/environment.ts). Configure the backend's `WEB_ORIGIN` to the exact frontend origin so authenticated requests pass its origin and CSRF checks. Session-cookie policy belongs to the API process.

## Preview verification

Create a preview against a separate test backend and verify login, session cookies, a permitted data read and a reversible synthetic form submission before configuring a production domain. A successful Next.js build alone does not verify connectivity or authentication.

The repository also contains a Socket.IO backend and a configured `/socket.io` rewrite. This is not evidence that a hosted realtime connection works. Verify transport routing and the ticket-based authentication flow separately if realtime is required.

Keep database credentials and backend signing keys on their respective backend services. This frontend deployment does not start the worker, WhatsApp connector, payment provider or mail service. See the [project README](./README.md) for local setup and integration boundaries.
