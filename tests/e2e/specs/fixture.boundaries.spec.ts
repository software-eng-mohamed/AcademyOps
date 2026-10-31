import { test, expect } from '@playwright/test';
import { authenticateSynthetic } from '../support/login';

test('no-grant fixture authenticates but cannot read owner imports', async ({ page }) => {
  const profile = await authenticateSynthetic(page, 'no_grant');
  expect(profile.roles).toEqual([]);
  expect(profile.permissions).toEqual([]);
  expect((await page.request.get('/api/v1/imports/batches?limit=1')).status()).toBe(403);
});

test('first-login fixture preserves password and onboarding gates', async ({ page }) => {
  const profile = await authenticateSynthetic(page, 'first_login');
  expect(profile.passwordChangeRequired).toBe(true);
  expect(profile.onboardingCompleted).toBe(false);
});
