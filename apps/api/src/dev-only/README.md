# Development-only API

This folder is intentionally isolated from the production API. `AppModule` imports
`DevOnlyModule` only when `NODE_ENV=development`, and its controllers are excluded
from OpenAPI.

`GET /api/v1/dev-only/totp` returns the current six-digit TOTP code for a local
development account. It never returns the encrypted or decrypted TOTP secret.

To remove this temporary surface, delete this folder, remove the `DevOnlyModule`
import and `developmentOnlyModules` registration from `src/app.module.ts`, and
delete `test/dev-only-totp.test.ts`.
