# API boundaries

The new frontend has one OpenAPI contract and two explicit runtime adapters:

- `generated/`: Orval React Query functions and hooks. Generated only; never edit by hand.
- `browser/`: same-origin HTTP transport, CSRF, auth-expiry events, and the Orval mutator.
- `server/`: server-only typed OpenAPI client, forwarded cookies, and internal API URL resolution.
- `query/`: TanStack Query client and retry policy.

Dependency rules:

1. Client features import hooks from `@/api/generated/...`.
2. Server Components import `createServerApiClient` from `@/api/server/client`.
3. Frontend code imports HTTP primitives only from `@academyops/api-client/http`; never from the legacy
   package root.
4. The HTTP transport performs one request. TanStack Query owns retries.
5. A mutation may retry only when one stable `Idempotency-Key` was created for the logical action.
