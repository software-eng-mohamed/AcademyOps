import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const outputRoot = resolve(process.cwd(), 'test-results/web');
const webBaseUrl = process.env.WEB_BASE_URL?.trim() || 'http://127.0.0.1:3140';
const webPort = Number(new URL(webBaseUrl).port || '80');
const useRunningWebServer = process.env.WEB_USE_RUNNING_SERVER === 'true';

if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65_535) {
  throw new Error('WEB_BASE_URL must include a valid port.');
}

export default defineConfig({
  ...(useRunningWebServer
    ? {}
    : {
        webServer: [
          {
            command: 'node mock-api.mjs',
            reuseExistingServer: false,
            timeout: 30_000,
            url: 'http://127.0.0.1:3999/health',
          },
          {
            command: `pnpm --filter @academyops/web exec next dev --turbopack -p ${webPort}`,
            env: {
              API_INTERNAL_URL: 'http://127.0.0.1:3999/api/v1',
              API_ORIGIN: 'http://127.0.0.1:3999',
              WEB_ORGANIZATION_CODE: 'ACADEMYOPS',
            },
            reuseExistingServer: false,
            timeout: 300_000,
            url: `${webBaseUrl}/health`,
          },
        ],
      }),
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  reporter: [['list']],
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  outputDir: resolve(outputRoot, 'artifacts'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: webBaseUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
