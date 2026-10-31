import type { Page } from '@playwright/test';
import { expect } from './test';
import { dashboardPath, E2E_LOCALE, type E2ERole } from './environment';

export async function expectDashboard(page: Page, role: E2ERole): Promise<void> {
  const path = dashboardPath();
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}(?:\\?|$)`));
  await expect(page.locator(`[data-overview-role="${role.toUpperCase()}"]`)).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
}

export async function expectForbiddenStaffPage(page: Page, path: string): Promise<void> {
  await page.goto(`/${E2E_LOCALE}/${path}`);
  await expect(
    page.getByRole('heading', {
      name: /No workspace access yet|لم يتم تفعيل مساحة عمل لحسابك بعد/,
    }),
  ).toBeVisible();
}

export async function expectForbiddenImportApi(page: Page): Promise<void> {
  const response = await page.request.get('/api/v1/imports/batches?limit=1');
  expect(response.status()).toBe(403);
}
