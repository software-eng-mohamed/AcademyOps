import { defineConfig } from 'prisma/config';
import * as dotenv from 'dotenv';
import * as path from 'path';

// App-specific values override the shared monorepo environment when both exist.
for (const environmentFile of [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../../.env'),
]) {
  dotenv.config({ path: environmentFile });
}

export default defineConfig({
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
  },
});
