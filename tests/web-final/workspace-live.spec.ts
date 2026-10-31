import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { E2E_BASE_URL } from '../e2e/support/environment';
import { authenticateSynthetic } from '../e2e/support/login';
import { expectLoadedWorkspace } from './live-helpers';

const workspaces = [
  'leads',
  'students',
  'registrations',
  'enrollments',
  'academic/programs',
  'academic/cohorts',
  'academic/resources',
  'sessions',
  'attendance',
  'certificates',
  'business-accounts',
  'finance',
  'payments',
  'documents',
  'reports',
  'imports',
  'audit',
  'legacy-archive',
  'whatsapp',
  'access',
] as const;

test('all current owner workspaces load real API data and are reachable from navigation', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await authenticateSynthetic(page, 'owner');
  const failedReads: string[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (
      path.startsWith('/api/v1/') &&
      response.request().method() === 'GET' &&
      response.status() >= 400
    ) {
      failedReads.push(`${response.status()} ${path}`);
    }
  });
  for (const workspace of workspaces) {
    await test.step(workspace, async () => {
      const dataRead = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          new URL(response.url()).pathname.startsWith('/api/v1/'),
      );
      expect((await page.goto(`/en/${workspace}`))?.status()).toBe(200);
      await expect(page).toHaveURL((url) => url.pathname === `/en/${workspace}`);
      await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
      await dataRead;
      await expectLoadedWorkspace(page);
      expect(failedReads).toEqual([]);
    });
  }

  await page.goto('/en/dashboard');
  await expect(page.locator('[data-overview-role="OWNER"]')).toBeVisible();
  for (const group of ['Academy', 'Operations', 'Finance', 'System']) {
    const trigger = page.getByRole('button', { exact: true, name: group });
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  }
  for (const workspace of workspaces) {
    await expect(page.locator(`a[href="/en/${workspace}"]`).first()).toBeVisible();
  }
});

test('the student form persists a name-only synthetic record in the verified disposable organization', async ({
  page,
}) => {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(E2E_BASE_URL).hostname)) {
    throw new Error('The UI mutation test requires a disposable loopback target.');
  }
  const profile = await authenticateSynthetic(page, 'owner');
  const organizationId = profile.organization?.id;
  if (typeof organizationId !== 'string')
    throw new Error('Synthetic organization identity is required before mutation.');
  const name = `TEST Publication ${randomUUID()}`;
  await page.goto('/en/students?view=table');
  await page.getByRole('button', { name: 'Add student', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add student', exact: true });
  await expect(dialog).toBeVisible();
  const candidates = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/students/match-candidates',
  );
  await dialog.getByLabel('Full name *', { exact: true }).fill(name);
  expect((await candidates).status()).toBe(201);
  await expect(dialog.getByText('Checking for matching people…', { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole('heading', { name: 'Possible matching people', exact: true }),
  ).toHaveCount(0);
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v1/students',
  );
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).not.toHaveProperty('phone');
  expect(response.request().postDataJSON()).not.toHaveProperty('email');
  const record = (await response.json()) as { id: string };
  expect(typeof record.id).toBe('string');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Record created', { exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search', exact: true });
  await search.fill(name);
  await search.press('Enter');
  await expect(page.getByRole('main').getByText(name, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByText(name, { exact: true })).toBeVisible();
  const saved = await page.request.get(`/api/v1/students/${encodeURIComponent(record.id)}`);
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ id: record.id, name, organizationId });
});
