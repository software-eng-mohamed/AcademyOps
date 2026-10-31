# AcademyOps Web

The production Next.js frontend for AcademyOps, with Arabic and English interfaces, role-based
workspaces, and typed API integration.

## Commands

- `pnpm --filter @academyops/web dev` — start on port 3130.
- `pnpm --filter @academyops/web api:generate` — regenerate typed TanStack Query hooks from OpenAPI.
- `pnpm --filter @academyops/web lint`
- `pnpm --filter @academyops/web typecheck`
- `pnpm --filter @academyops/web test`
- `pnpm --filter @academyops/web test:dev-start` — test cold-start readiness and timeout handling.
- `pnpm --filter @academyops/web build`
- `pnpm --filter @academyops/web start` — run the standalone build locally on port 3130.

Run commands from the repository root. To build the production image (port 3100), provide the
public origin and the API address reachable from the running web container:

```sh
docker build --build-arg API_ORIGIN=https://academy.example.com --build-arg API_INTERNAL_URL=http://api:3001/api/v1 -f deploy/Dockerfile.web -t plg-web .
```

Replace the example origins for your deployment. Next.js rewrites are set at build time, so
rebuild the image when these addresses change.

`pnpm web:e2e --workers=1` exercises the current frontend against a local mock API using Chromium.
These checks cover authentication, locale direction, dashboard charts, and desktop/mobile
navigation. They do not replace the separate API/database integration tests.

Browser requests use same-origin `/api/v1` rewrites. Server Components use `API_INTERNAL_URL`, falling back to `API_ORIGIN` and then `http://localhost:3001/api/v1` locally.

The development launcher waits up to three minutes for API readiness and reports progress
every 15 seconds. If the API needs longer, it warns and starts Next.js anyway instead of
exiting and making Turbo terminate the API and worker. API-backed pages still need a healthy
API; check the `@academyops/api:dev` logs if they are unavailable. Production startup is unchanged.

The HTTP transport performs exactly one request and owns auth/CSRF headers, cancellation,
timeouts, typed errors, correlation IDs, idempotency metadata, and `Retry-After` parsing. TanStack
Query owns retry policy: retryable queries get at most one retry; mutations get none unless their
request includes an `Idempotency-Key`, in which case they get at most one retry.

See [`src/api/README.md`](src/api/README.md) for the enforced browser/server/generated/query
boundaries. New frontend code must not import the legacy `@academyops/api-client` package root.
