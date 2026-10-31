import { test, expect } from '../support/test';
import { expectDashboard } from '../support/dashboard';

test('owner dashboard and owner-only import API are available', async ({ page }) => {
  await expectDashboard(page, 'owner');
  const imports = await page.request.get('/api/v1/imports/batches?limit=1');
  expect(imports.status()).toBe(200);
});
