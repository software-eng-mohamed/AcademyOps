import path from 'node:path';
import * as dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

// Never inherit developer/deployment .env files: integration suites write to their
// database and Redis. Supply disposable services through .env.test or explicit CI env.
process.env.NODE_ENV = 'test';
for (const environmentFile of [
  path.resolve(import.meta.dirname, '.env.test'),
  path.resolve(import.meta.dirname, '../../.env.test'),
]) {
  dotenv.config({ path: environmentFile });
}

process.env.CLAMAV_MODE ??= 'disabled';
process.env.OTP_CONNECTOR_INTERNAL_TOKEN ??=
  '9999999999999999999999999999999999999999999999999999999999999999';
process.env.OTP_CONNECTOR_URL ??= 'http://localhost:3002';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
