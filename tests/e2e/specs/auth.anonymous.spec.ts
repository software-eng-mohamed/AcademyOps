import { test, expect } from '../support/test';
import { credentialsFor, E2E_ORGANIZATION_CODE } from '../support/environment';

test('protected dashboard redirects an anonymous visitor to login', async ({ page }) => {
  await page.goto('/en/dashboard');
  await expect(page).toHaveURL((url) => url.pathname === '/en/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toBeEnabled();
});

test('invalid credentials return the generic authentication error', async ({ page }) => {
  await page.goto('/en/login');
  await page.getByLabel('Email', { exact: true }).fill('no-account+synthetic@e2e.invalid');
  await page.getByLabel('Password', { exact: true }).fill('SyntheticOnly#Wrong2026');
  await page.locator('form button[type="submit"]').click();
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'Those sign-in details are not correct.',
  );
  await expect(page).toHaveURL(/\/en\/login(?:\?|$)/);
});

test('a synthetic student signs in through the real form and receives the student overview', async ({
  page,
}) => {
  const credentials = credentialsFor('student');
  await page.goto('/en/login');
  await page.getByLabel('Email', { exact: true }).fill(credentials.email);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  const login = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/auth/login',
  );
  await page.locator('form button[type="submit"]').click();
  expect((await login).status()).toBe(201);
  await expect(page).toHaveURL(/\/en\/dashboard(?:\?|$)/);
  await expect(page.locator('[data-overview-role="STUDENT"]')).toBeVisible();
  const me = await page.request.get('/api/v1/auth/me');
  expect(me.status()).toBe(200);
  const profile = (await me.json()) as {
    organization: { code: string };
    roles: Array<{ code: string }>;
  };
  expect(profile.organization.code).toBe(E2E_ORGANIZATION_CODE);
  expect(profile.roles.some((role) => role.code === 'STUDENT')).toBe(true);
});
