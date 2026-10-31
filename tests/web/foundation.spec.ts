import { expect, test } from '@playwright/test';
import { authenticate } from './foundation-support';

test('serves the production web foundation with locale and security boundaries', async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const redirect = await request.get('/', { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  expect(redirect.headers().location).toBe('/ar/login');

  await authenticate(page);
  const response = await page.goto('/ar/dashboard');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const sidebar = page.locator('[data-sidebar-role="OWNER"]');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute('data-sidebar-source', 'boardui');
  await expect(sidebar).toHaveCSS('width', '260px');
  await expect(
    page.getByRole('heading', { name: 'أهلًا بيك يا Development', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'مسار الصفحة' })).toContainText('لوحة التحكم');
  await expect(page.getByText('الطلاب النشطون', { exact: true })).toBeVisible();
  await expect(page.locator('p').filter({ hasText: /^١٢٨$/ })).toBeVisible();
  await expect(page.getByText('المستخدمون والصلاحيات', { exact: true })).toBeVisible();
  const systemCategory = sidebar.locator('[data-navigation-category="system"]');
  const systemCategoryTrigger = systemCategory.getByRole('button', { name: 'النظام' });
  await expect(systemCategoryTrigger).toHaveCSS('cursor', 'pointer');
  await expect(systemCategoryTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(systemCategoryTrigger).toHaveText('النظام');
  await systemCategoryTrigger.click();
  await expect(page.getByText('المستخدمون والصلاحيات', { exact: true })).not.toBeVisible();
  await systemCategoryTrigger.click();
  await expect(page.getByText('المستخدمون والصلاحيات', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toHaveText('');
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  expect(response?.headers()['x-frame-options']).toBe('DENY');
  expect(response?.headers()['x-content-type-options']).toBe('nosniff');
  await expect(page.getByRole('img', { name: 'نمو الالتحاقات', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'أداء التحصيلات', exact: true })).toBeVisible();
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('foundation.png') });
});

test('redirects an unauthenticated dashboard request to the localized login', async ({ page }) => {
  await page.goto('/en/dashboard');
  await expect(page).toHaveURL('/en/login');
});

test('redirects an authenticated login request to the localized dashboard', async ({ page }) => {
  await authenticate(page);
  await page.goto('/en/login');

  await expect(page).toHaveURL('/en/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Good to see you, Development.', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Log in to AcademyOps' })).toHaveCount(0);
});

test('shows the lightweight dashboard loader only on the first entry', async ({ page }) => {
  await authenticate(page, { loaderSeen: false });
  await page.goto('/en/dashboard');

  const loader = page.getByRole('status', { name: 'Loading page' });
  await expect(loader).toBeVisible();
  await expect(loader).toHaveCount(0, { timeout: 3_000 });

  await page.reload();
  await expect(page.locator('[data-dashboard-initial-loader]')).toHaveCount(0);
});

test('exposes a strict web health endpoint and proxies the backend API', async ({ request }) => {
  const webHealth = await request.get('/health');
  expect(webHealth.status()).toBe(200);
  expect(webHealth.headers()['cache-control']).toContain('no-store');
  await expect(webHealth.json()).resolves.toMatchObject({ service: 'web', status: 'healthy' });

  const apiHealth = await request.get('/api/v1/health/live');
  expect(apiHealth.status()).toBe(200);
  await expect(apiHealth.json()).resolves.toEqual({ service: 'api', status: 'healthy' });
});

test('keeps the single-branch owner overview focused on its content', async ({ page }) => {
  await authenticate(page);
  await page.goto('/en/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Good to see you, Development.', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Active students', { exact: true })).toBeVisible();
  await expect(page.locator('p').filter({ hasText: /^128$/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Branch' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh data' })).toHaveCount(0);
  await expect(page.getByText(/Updated Aug/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByText('Your report is ready')).toBeVisible();
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.getByText('All notifications were removed.')).toBeVisible();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expect(page.locator('[data-dashboard-section="owner-metrics"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-section="priority-queue"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-canvas]')).toHaveCSS('border-radius', '28px');
});

test('renders the complete owner command center in light and dark themes', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: 'light' });
  await authenticate(page);
  await page.goto('/en/dashboard');

  await expect(page.locator('[data-overview-role="OWNER"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-shell]')).toHaveCSS(
    'background-color',
    'rgb(235, 235, 235)',
  );
  await expect(page.locator('[data-dashboard-canvas]')).toHaveCSS(
    'background-color',
    'rgb(247, 247, 248)',
  );
  await expect(page.locator('[data-dashboard-section="owner-metrics"]')).toBeVisible();
  await expect(page.getByText('Net collections MTD', { exact: true })).toBeVisible();
  await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Owner action queue' })).toBeVisible();
  await expect(
    page.locator('[data-dashboard-section="today-sessions"]').getByRole('heading', {
      name: "Today's sessions",
    }),
  ).toBeVisible();
  const enrollmentChart = page.getByRole('img', { name: 'Enrollment growth', exact: true });
  const collectionsChart = page.getByRole('img', {
    name: 'Collections performance',
    exact: true,
  });
  await expect(enrollmentChart)
    .toBeVisible()
    .catch(async (error: unknown) => {
      const layout = await page
        .getByRole('button', { name: /^Enrollment growth Compare/ })
        .evaluate((card) =>
          [card, ...card.querySelectorAll('div')].map((element) => ({
            className: element.getAttribute('class'),
            height: element.getBoundingClientRect().height,
            width: element.getBoundingClientRect().width,
            display: getComputedStyle(element).display,
            computedHeight: getComputedStyle(element).height,
            style: element.getAttribute('style'),
          })),
        );
      await testInfo.attach('chart-layout.json', {
        body: JSON.stringify(layout, null, 2),
        contentType: 'application/json',
      });
      throw error;
    });
  await expect(collectionsChart).toBeVisible();
  await expect
    .poll(() =>
      collectionsChart
        .locator('rect')
        .evaluateAll((bars) => bars.some((bar) => Number(bar.getAttribute('height')) > 50)),
    )
    .toBe(true);
  await page.screenshot({ fullPage: false, path: testInfo.outputPath('owner-overview-light.png') });
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('owner-overview-full.png') });

  await page.locator('#main-content').evaluate((main) => {
    main.scrollTop = main.scrollHeight;
  });
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Academy health' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('[data-dashboard-shell]')).toHaveCSS(
    'background-color',
    'rgb(23, 23, 23)',
  );
  await expect(page.locator('[data-dashboard-canvas]')).toHaveCSS(
    'background-color',
    'rgb(23, 23, 23)',
  );
  await page.locator('#main-content').evaluate((main) => {
    main.scrollTop = 0;
  });
  await expect(collectionsChart).toBeVisible();
  await page.screenshot({ fullPage: false, path: testInfo.outputPath('owner-overview-dark.png') });
});
