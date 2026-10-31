import { expect, test } from '@playwright/test';
import {
  authenticate,
  clickAndCaptureAnimation,
  readSidebarPreferences,
} from './foundation-support';

test('keeps the dashboard usable on a mobile viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await page.goto('/ar/dashboard');
  await page.getByRole('button', { name: 'فتح قائمة التنقل' }).click();
  const navigationDialog = page.getByRole('dialog', { name: 'التنقل الرئيسي' });
  await expect(navigationDialog).toBeVisible();
  await expect(navigationDialog.getByText('المستخدمون والصلاحيات', { exact: true })).toBeVisible();
  const mobileSystemCategory = navigationDialog.locator('[data-navigation-category="system"]');
  const mobileSystemTrigger = mobileSystemCategory.getByRole('button', { name: 'النظام' });
  const mobileSystemPanel = mobileSystemCategory.locator('.sidebar-category-motion');
  expect(await clickAndCaptureAnimation(mobileSystemTrigger, mobileSystemPanel)).toEqual({
    duration: '0.26s',
    name: 'sidebar-category-out',
  });
  await expect(mobileSystemTrigger).toHaveAttribute('aria-expanded', 'false');
  expect(await clickAndCaptureAnimation(mobileSystemTrigger, mobileSystemPanel)).toEqual({
    duration: '0.26s',
    name: 'sidebar-category-in',
  });
  await expect(mobileSystemTrigger).toHaveAttribute('aria-expanded', 'true');

  const mobileCategories = navigationDialog.locator('[data-navigation-category]');
  for (let index = 0; index < (await mobileCategories.count()); index += 1) {
    const trigger = mobileCategories.nth(index).locator('button[slot="trigger"]');
    if ((await trigger.getAttribute('aria-expanded')) === 'true') {
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
  }

  const dialogBox = await navigationDialog.boundingBox();
  const scrollRegionBox = await navigationDialog
    .locator('[data-sidebar-scroll-region]')
    .boundingBox();
  const footerBox = await navigationDialog.locator('[data-sidebar-footer]').boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(scrollRegionBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect((scrollRegionBox?.y ?? 0) + (scrollRegionBox?.height ?? 0)).toBeLessThanOrEqual(
    footerBox?.y ?? 0,
  );
  expect(
    Math.abs(
      (dialogBox?.y ?? 0) +
        (dialogBox?.height ?? 0) -
        ((footerBox?.y ?? 0) + (footerBox?.height ?? 0)),
    ),
  ).toBeLessThanOrEqual(16);
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
  await page.screenshot({ path: testInfo.outputPath('owner-mobile-navigation-rtl.png') });
  await page.keyboard.press('Escape');
  await expect(navigationDialog).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('owner-mobile-overview-rtl.png') });
});

test('supports collapsing, searching, language direction, and real logout', async ({ page }) => {
  await authenticate(page);
  await page.goto('/en/dashboard');

  const sidebar = page.locator('[data-sidebar-role="OWNER"]');
  await expect(sidebar).toHaveCSS('width', '260px');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'true');
  await expect(sidebar).toHaveCSS('width', '60px');
  await expect(sidebar.getByRole('button', { name: 'Search navigation' })).toHaveCount(0);
  await expect(sidebar.locator('[data-compact-category]')).toHaveCount(4);
  await sidebar.locator('[data-compact-category="academy"]').click();
  await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'false');
  await expect(sidebar).toHaveCSS('width', '260px');
  await expect(
    sidebar.locator('[data-navigation-category="academy"]').getByRole('button', {
      name: 'Academy',
    }),
  ).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'true');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'false');
  await expect(sidebar).toHaveCSS('width', '260px');

  await page.getByRole('button', { name: 'Search navigation', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search navigation' }).fill('WhatsApp');
  await expect(page.getByText('WhatsApp OTP', { exact: true })).toBeVisible();
  await expect(page.getByText('Students', { exact: true })).toHaveCount(0);

  const accountMenuTrigger = page.getByRole('button', { name: 'Account menu' });
  const accountMenuTriggerBox = await accountMenuTrigger.boundingBox();
  const sidebarBox = await sidebar.boundingBox();
  await accountMenuTrigger.click();
  const accountMenu = page.getByRole('menu');
  await expect(accountMenu).toHaveAttribute('data-side', 'right');
  await expect(accountMenu.getByText('AcademyOps', { exact: true })).toBeVisible();
  const accountMenuBox = await accountMenu.boundingBox();
  const accountMenuColors = await accountMenu.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderTopColor,
    borderWidth: getComputedStyle(element).borderTopWidth,
  }));
  expect(accountMenuTriggerBox).not.toBeNull();
  expect(sidebarBox).not.toBeNull();
  expect(accountMenuBox).not.toBeNull();
  expect(accountMenuBox?.x).toBeGreaterThanOrEqual((sidebarBox?.x ?? 0) + (sidebarBox?.width ?? 0));
  expect(Math.abs((accountMenuBox?.y ?? 0) - (accountMenuTriggerBox?.y ?? 0))).toBeLessThanOrEqual(
    1,
  );
  expect(accountMenuColors.borderWidth).toBe('1px');
  expect(accountMenuColors.border).not.toBe(accountMenuColors.background);
  await expect(page.getByText('Main Branch', { exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'العربية' }).click();
  await expect(page).toHaveURL('/ar/dashboard');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.getByRole('button', { name: 'قائمة الحساب' }).click();
  await page.getByRole('menuitem', { name: 'تسجيل الخروج' }).click();
  await expect(page).toHaveURL('/ar/login');
});

test('persists the collapsed rail and expanded categories across reloads', async ({ page }) => {
  await authenticate(page);
  await page.goto('/en/dashboard');

  const sidebar = page.locator('[data-sidebar-role="OWNER"]');
  const operationsCategory = sidebar.locator('[data-navigation-category="operations"]');
  const operationsTrigger = operationsCategory.getByRole('button', { name: 'Operations' });
  const operationsPanel = operationsCategory.locator('.sidebar-category-motion');

  expect(await clickAndCaptureAnimation(operationsTrigger, operationsPanel)).toEqual({
    duration: '0.32s',
    name: 'sidebar-category-out',
  });
  await expect(operationsTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(async () => (await readSidebarPreferences(page))?.expandedGroups.includes('operations'))
    .toBe(false);
  const preferences = await readSidebarPreferences(page);
  expect(preferences).toMatchObject({ collapsed: false, version: 1 });
  expect(preferences?.expandedGroups).not.toContain('operations');

  await page.reload();
  await expect(operationsTrigger).toHaveAttribute('aria-expanded', 'false');
  expect(await clickAndCaptureAnimation(operationsTrigger, operationsPanel)).toEqual({
    duration: '0.32s',
    name: 'sidebar-category-in',
  });
  await expect(operationsTrigger).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'true');
  await expect.poll(async () => (await readSidebarPreferences(page))?.collapsed).toBe(true);

  await page.reload();
  await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'true');
  await sidebar.locator('[data-compact-category="academy"]').click();
  await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'false');
});

test('renders saved sidebar preferences in the first frame without a hydration jump', async ({
  page,
}) => {
  await authenticate(page);
  const cookieValue = encodeURIComponent(
    JSON.stringify({ collapsed: true, expandedGroups: ['academy'], version: 1 }),
  );
  await page.context().addCookies([
    {
      domain: '127.0.0.1',
      name: 'plg_dashboard_sidebar',
      path: '/',
      sameSite: 'Lax',
      value: cookieValue,
    },
  ]);
  await page.addInitScript(() => {
    const states: string[] = [];
    const recordState = () => {
      const state = document
        .querySelector('[data-sidebar-role]')
        ?.getAttribute('data-sidebar-collapsed');
      if (state && states.at(-1) !== state) states.push(state);
    };
    new MutationObserver(recordState).observe(document, {
      attributeFilter: ['data-sidebar-collapsed'],
      attributes: true,
      childList: true,
      subtree: true,
    });
    document.addEventListener('DOMContentLoaded', recordState, { once: true });
    Object.defineProperty(window, '__sidebarInitialStates', { value: states });
  });

  await page.goto('/en/dashboard');
  const sidebar = page.locator('[data-sidebar-role="OWNER"]');
  await expect(sidebar).toHaveAttribute('data-sidebar-collapsed', 'true');
  const initialStates = await page.evaluate(
    () =>
      (
        window as Window & {
          __sidebarInitialStates?: string[];
        }
      ).__sidebarInitialStates,
  );
  expect(initialStates).toEqual(['true']);

  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(
    sidebar.locator('[data-navigation-category="academy"]').getByRole('button', {
      name: 'Academy',
    }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(
    sidebar.locator('[data-navigation-category="operations"]').getByRole('button', {
      name: 'Operations',
    }),
  ).toHaveAttribute('aria-expanded', 'false');
});
