import { expect, test } from '@playwright/test';
import { authenticateSynthetic } from '../e2e/support/login';
import { expectAccessible, expectLoadedWorkspace, expectNoBodyOverflow } from './live-helpers';

test('attendance opens a real session roster and returns to the session list on desktop and mobile', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await authenticateSynthetic(page, 'attendance');
  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 844, width: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/en/attendance?view=table');
    await expect(page.getByRole('heading', { name: 'Attendance', exact: true })).toBeVisible();
    const rosterLink = page.getByRole('link', { name: 'Open roster', exact: true }).first();
    await expect(rosterLink).toBeVisible();
    const rosterResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        /\/sessions\/[^/]+\/attendance$/.test(new URL(response.url()).pathname),
    );
    await rosterLink.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === '/en/attendance' && Boolean(url.searchParams.get('sessionId')),
    );
    const response = await rosterResponse;
    expect(response.status()).toBe(200);
    const data = (await response.json()) as { items: unknown[] };
    expect(
      data.items.length,
      'The synthetic session must contain enrolled students.',
    ).toBeGreaterThan(0);
    await expect(page.getByRole('table', { name: 'Session roster' })).toBeVisible();
    await expectLoadedWorkspace(page);
    await expectNoBodyOverflow(page);
    await expectAccessible(page, testInfo, `attendance-${viewport.width}`);
    await page.getByRole('button', { name: 'Back to sessions', exact: true }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has('sessionId'));
    await expect(
      page.getByRole('link', { name: 'Open roster', exact: true }).first(),
    ).toBeVisible();
  }
});
