import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');
const outputRoot = resolve(repoRoot, 'test-results/web-final/live');
// Keep the local live origin aligned with WEB_ORIGIN so CSRF checks exercise the
// production contract instead of being bypassed or failing on a host alias.
const baseURL = process.env.E2E_BASE_URL?.trim() || 'http://localhost:3110';
process.env.E2E_BASE_URL = baseURL;

export default defineConfig({
  expect: { timeout: 12_000 },
  outputDir: resolve(outputRoot, 'artifacts'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: resolve(outputRoot, 'report') }]],
  retries: 0,
  testDir: '.',
  testMatch:
    /(?:attendance-roster-live|live-roles|role-visual-live|whatsapp-live|workspace-live)\.spec\.ts/,
  timeout: 90_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    locale: 'en-GB',
    screenshot: 'only-on-failure',
    timezoneId: 'Africa/Cairo',
    trace: 'retain-on-failure',
  },
  workers: 1,
});
