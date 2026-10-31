# API contracts and frontend coverage

The frontend contract is OpenAPI 3.1 and is generated from the compiled NestJS application. The generated document is the source of truth for request parameters, request bodies, successful responses, and generated TypeScript clients.

## Current coverage

- 185 paths and 215 public operations.
- 208 JSON responses with typed schemas.
- 6 intentional no-content responses.
- 1 binary file-delivery response.
- 0 unclassified operations and 0 successful responses without a contract.

The complete route-by-route inventory is in [api-catalog.md](api-catalog.md). Product-surface decisions are explicit in [api-operation-surfaces.json](api-operation-surfaces.json), so infrastructure probes and server callbacks are not mistaken for dashboard screens.

## Sources and generated artifacts

| Artifact                                           | Role                                                     |
| -------------------------------------------------- | -------------------------------------------------------- |
| `apps/api/src/**/*.controller.ts`                  | Runtime routes and inferred return types                 |
| `apps/api/src/openapi-response-types.generated.ts` | Generated structural response types; never edit manually |
| `packages/api-client/openapi.json`                 | OpenAPI 3.1 source of truth for frontend tooling         |
| `packages/api-client/src/generated.ts`             | Shared `openapi-typescript` types                        |
| `apps/web/src/api/generated/`                      | Production Orval functions and TanStack Query hooks      |
| `docs/api-operation-surfaces.json`                 | Explicit product surface for every operation             |
| `docs/api-catalog.md`                              | Human-readable endpoint inventory                        |

Prisma dates are documented as `date-time` strings, decimals as decimal strings, and arbitrary database JSON as `unknown` until a domain DTO narrows it. Existing explicit response DTOs take precedence over inferred schemas.

## Regeneration workflow

```powershell
pnpm api:generate
pnpm --filter @academyops/web api:generate
pnpm api:contract:check
```

`api:generate` compiles Nest with the Swagger plugin, emits OpenAPI, derives missing response schemas, regenerates the shared TypeScript client, and validates the contract. The Orval command updates the query hooks consumed by the frontend.

When a controller operation is added or removed:

1. Run `pnpm api:catalog:sync`.
2. Replace every new `unclassified` entry in `docs/api-operation-surfaces.json` with its intended surface.
3. Run the regeneration workflow above.

The contract gate fails on operation drift, missing success schemas, invalid binary/no-content responses, unresolved component references, stale surface entries, or unclassified operations.

## Frontend rule

The new frontend must consume the generated client instead of maintaining handwritten endpoint URLs or duplicate response interfaces. Public auth, public registration, certificate verification, asset delivery, integration callbacks, and infrastructure probes remain in the same contract, but only `dashboard` operations belong to authenticated dashboard feature coverage.
