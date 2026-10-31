import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { E2E_BASE_URL, roleStatePath } from './support/environment';

const artifactsRoot = resolve(process.cwd(), 'test-results/e2e');

export default defineConfig({
  testDir: './specs',
  outputDir: resolve(artifactsRoot, 'artifacts'),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 1,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['junit', { outputFile: resolve(artifactsRoot, 'junit.xml') }],
    ['html', { outputFolder: resolve(artifactsRoot, 'report'), open: 'never' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: E2E_BASE_URL,
    locale: 'en-GB',
    timezoneId: 'Africa/Cairo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'anonymous',
      testMatch: /(?:auth\.anonymous|fixture\.boundaries|support)\.spec\.ts/,
    },
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'owner',
      dependencies: ['auth-setup'],
      testMatch: /dashboard\.owner\.spec\.ts/,
      use: { storageState: roleStatePath('owner') },
    },
    {
      name: 'accounts',
      dependencies: ['auth-setup'],
      testMatch: /dashboard\.accounts\.spec\.ts/,
      use: { storageState: roleStatePath('accounts') },
    },
    {
      name: 'attendance',
      dependencies: ['auth-setup'],
      testMatch: /dashboard\.attendance\.spec\.ts/,
      use: { storageState: roleStatePath('attendance') },
    },
    {
      name: 'student',
      dependencies: ['auth-setup'],
      testMatch: /dashboard\.student\.spec\.ts/,
      use: { storageState: roleStatePath('student') },
    },
    {
      name: 'security-boundaries',
      dependencies: ['auth-setup'],
      testMatch: /security\.spec\.ts/,
      use: { storageState: roleStatePath('student') },
    },
    {
      name: 'realtime-recovery',
      dependencies: ['auth-setup'],
      testMatch: /realtime\.spec\.ts/,
      use: { storageState: roleStatePath('student') },
    },
  ],
});
