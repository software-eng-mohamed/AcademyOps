import { expect, test } from '@playwright/test';
import type { FixtureRole } from '../e2e/support/environment';
import { authenticateSynthetic } from '../e2e/support/login';
import { expectLoadedWorkspace } from './live-helpers';

const roles = [
  'owner',
  'operations',
  'academic',
  'reception',
  'sales',
  'accounts',
  'attendance',
  'trainer',
  'student',
  'otp_operator',
] as const satisfies readonly FixtureRole[];

for (const role of roles) {
  test(`${role} receives its own overview at the shared dashboard route`, async ({ page }) => {
    const profile = await authenticateSynthetic(page, role);
    expect(profile.roles?.some((entry) => entry.code === role.toUpperCase())).toBe(true);
    expect(profile.permissions?.length).toBeGreaterThan(0);

    const response = await page.goto('/en/dashboard');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/en\/dashboard(?:\?|$)/);
    await expect(page.locator(`[data-overview-role="${role.toUpperCase()}"]`)).toBeVisible();
    await expectLoadedWorkspace(page);
  });
}

test('no-grant account receives an explicit access state without staff navigation', async ({
  page,
}) => {
  const profile = await authenticateSynthetic(page, 'no_grant');
  expect(profile.roles).toEqual([]);
  expect(profile.permissions).toEqual([]);

  expect((await page.goto('/en/dashboard'))?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'No workspace access yet' })).toBeVisible();
  await expect(page.locator('[data-overview-role]')).toHaveCount(0);
  for (const path of ['students', 'payments', 'imports', 'access']) {
    await expect(page.locator(`a[href="/en/${path}"]`)).toHaveCount(0);
  }
  expect((await page.request.get('/api/v1/imports/batches?limit=1')).status()).toBe(403);
});
