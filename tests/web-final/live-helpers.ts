import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

export async function expectLoadedWorkspace(page: Page) {
  const main = page.getByRole('main');
  await expect(main).toBeVisible();
  await expect(page).toHaveTitle(/AcademyOps/);
  await expect(page.locator('body')).not.toContainText(/\bPLG\b/i);
  await expect(main.locator('[aria-busy="true"], .animate-pulse')).toHaveCount(0);
  await expect(main.getByRole('alert')).toHaveCount(0);
  await expect(main.getByText(/unexpected application error|application error:/i)).toHaveCount(0);
}

export async function expectNoBodyOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'The page must keep wide tables inside their own scroll containers.',
  ).toBe(true);
}

export async function expectAccessible(page: Page, testInfo: TestInfo, label: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await testInfo.attach(`axe-${label}.json`, {
    body: Buffer.from(JSON.stringify({ url: page.url(), violations: result.violations }, null, 2)),
    contentType: 'application/json',
  });
  // Continue the viewport matrix while preserving a failing test result.
  // Complete node details are attached instead of flooding the console.
  expect
    .soft(
      result.violations.map(({ id, nodes }) => `${id}: ${nodes.length} affected elements`),
      label,
    )
    .toEqual([]);
}
