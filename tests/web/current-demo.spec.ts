import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';

const demoEnabled = process.env.ACADEMYOPS_DEMO_ONLY === 'true';
const email = 'owner@academyops.demo';
const password = 'AcademyOps-Demo-2026!';
type Locale = 'en' | 'ar';

async function observeDemo(context: BrowserContext, origin: string) {
  const failures: string[] = [];
  const pending = new Set<Request>();
  await context.route(
    (url) => ['http:', 'https:'].includes(url.protocol) && url.origin !== origin,
    async (route) => {
      const url = new URL(route.request().url());
      failures.push(`External request: ${url.origin}${url.pathname}`);
      await route.abort('blockedbyclient');
    },
  );
  const observePage = (page: Page) => {
    page.on('pageerror', (error) => failures.push(`Page error: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(`Console error: ${message.text()}`);
    });
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/')) pending.add(request);
    });
    page.on('response', (response) => {
      // A 204 is complete at its headers; Chromium may not emit requestfinished
      // for an intercepted, bodyless fetch before the next navigation.
      if (response.status() === 204) pending.delete(response.request());
      if (
        response.status() >= 400 &&
        (new URL(response.url()).pathname.startsWith('/api/v1/') ||
          response.request().isNavigationRequest())
      ) {
        failures.push(
          `HTTP ${response.status()}: ${response.request().method()} ${response.url()}`,
        );
      }
    });
    page.on('requestfinished', (request) => pending.delete(request));
    page.on('requestfailed', (request) => {
      if (!pending.delete(request)) return;
      const reason = request.failure()?.errorText ?? 'unknown failure';
      if (request.method() !== 'GET' || !/ERR_ABORTED|NS_BINDING_ABORTED/.test(reason)) {
        failures.push(`Request failed: ${request.method()} ${request.url()} ${reason}`);
      }
    });
  };
  context.pages().forEach(observePage);
  context.on('page', observePage);
  return async () => {
    await expect
      .poll(() => [...pending].map((request) => `${request.method()} ${request.url()}`), {
        message: 'Internal mock requests settle',
      })
      .toEqual([]);
    expect(failures, 'Original UI must use healthy internal mock responses only').toEqual([]);
  };
}

async function successfulResponse(result: Promise<Response>) {
  const response = await result;
  expect(response.ok(), `${response.status()} ${response.url()}`).toBe(true);
  if (response.status() === 204) return;
  expect(await response.finished(), 'Response body finishes before the next action').toBeNull();
}

async function login(page: Page, locale: Locale = 'en') {
  await page.goto(`/${locale}/login`);
  await expect(page.getByRole('heading', { name: /AcademyOps/ })).toBeVisible();
  await page
    .getByLabel(locale === 'en' ? 'Email' : 'البريد الإلكتروني', { exact: true })
    .fill(email);
  await page
    .getByLabel(locale === 'en' ? 'Password' : 'كلمة المرور', { exact: true })
    .fill(password);
  const response = page.waitForResponse(
    (item) => item.url().endsWith('/api/v1/auth/login') && item.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: locale === 'en' ? 'Sign in' : 'تسجيل الدخول', exact: true })
    .click();
  await successfulResponse(response);
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard$`));
  await expect(page.locator('[data-overview-role="OWNER"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-initial-loader]')).toHaveCount(0);
}

async function search(page: Page, text: string) {
  const field = page.getByRole('searchbox', { name: 'Search', exact: true });
  const resource = new URL(page.url()).pathname.split('/').at(-1);
  const refreshed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === 'GET' &&
      url.pathname === `/api/v1/${resource}` &&
      url.searchParams.get('search') === text
    );
  });
  await field.fill(text);
  await field.press('Enter');
  await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe(text);
  await successfulResponse(refreshed);
}

async function createPerson(page: Page, resource: 'students' | 'leads', name: string) {
  await page.goto(`/en/${resource}`);
  await page
    .getByRole('button', {
      name: resource === 'students' ? 'Add student' : 'Add lead',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog').last();
  const nameField = dialog.getByLabel(/^Full name/);
  await expect(nameField).toBeVisible();
  const matches = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/students/match-candidates'),
  );
  await nameField.fill(name);
  await successfulResponse(matches);
  await expect(dialog.getByText('Checking for matching people…', { exact: true })).toHaveCount(0);
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/v1/${resource}` &&
      response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await successfulResponse(saved);
  await expect(dialog).not.toBeVisible();
  await search(page, name);
  await expect(
    page.getByRole('button', { name: `View details: ${name}`, exact: true }),
  ).toBeVisible();
}

test.describe('original application with the internal demo API', () => {
  test.skip(!demoEnabled, 'Requires the explicitly enabled internal demo deployment');
  test.setTimeout(180_000);

  test('uses the original login, SSR dashboard, reload and logout', async ({
    page,
    context,
    baseURL,
  }) => {
    const verify = await observeDemo(context, new URL(baseURL!).origin);
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/en\/login$/);
    await login(page);
    for (const section of ['owner-metrics', 'priority-queue', 'today-sessions']) {
      await expect(page.locator(`[data-dashboard-section="${section}"]`)).toBeVisible();
    }
    await page.reload();
    await expect(page.locator('[data-overview-role="OWNER"]')).toBeVisible();
    await page.getByRole('button', { name: 'Account menu', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/login$/);
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/en\/login$/);
    await verify();
  });

  test('opens every original owner sidebar page without API or rendering errors', async ({
    page,
    context,
    baseURL,
  }) => {
    const verify = await observeDemo(context, new URL(baseURL!).origin);
    await login(page);
    const sidebar = page.locator('[data-sidebar-role="OWNER"]:visible');
    const links = await sidebar
      .getByRole('link')
      .evaluateAll((items) => [
        ...new Set(
          items
            .map((item) => item.getAttribute('href'))
            .filter((href): href is string => Boolean(href?.startsWith('/en/'))),
        ),
      ]);
    expect(links).toEqual(
      expect.arrayContaining(['/en/students', '/en/payments', '/en/attendance', '/en/access']),
    );
    expect(links.length).toBeGreaterThanOrEqual(15);
    for (const href of links) {
      await sidebar.locator(`a[href="${href}"]`).click();
      await expect(page).toHaveURL(href);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
      await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
      await verify();
    }
  });

  test('persists student create, edit and search while isolating another visitor', async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const verify = await observeDemo(context, new URL(baseURL!).origin);
    await login(page);
    const name = 'Demo Browser Student';
    const renamed = 'Demo Browser Student Updated';
    await createPerson(page, 'students', name);
    await page.getByRole('button', { name: `View details: ${name}`, exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Edit details', exact: true })
      .click();
    const edit = page.getByRole('dialog').filter({
      has: page.getByRole('button', { name: 'Save changes', exact: true }),
    });
    await edit.getByLabel(/^Full name/).fill(renamed);
    const saved = page.waitForResponse(
      (response) =>
        /\/api\/v1\/students\/[^/]+$/.test(new URL(response.url()).pathname) &&
        response.request().method() === 'PATCH',
    );
    await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
    await successfulResponse(saved);
    await expect(edit).not.toBeVisible();
    await page.goto('/en/students');
    await search(page, renamed);
    await expect(
      page.getByRole('button', { name: `View details: ${renamed}`, exact: true }),
    ).toBeVisible();
    await verify();
    await page.reload();
    await expect(
      page.getByRole('button', { name: `View details: ${renamed}`, exact: true }),
    ).toBeVisible();
    const other = await browser.newContext({ baseURL: baseURL! });
    try {
      const otherVerify = await observeDemo(other, new URL(baseURL!).origin);
      const otherPage = await other.newPage();
      await login(otherPage);
      await otherPage.goto('/en/students');
      await search(otherPage, renamed);
      await expect(
        otherPage.getByRole('button', { name: `View details: ${renamed}`, exact: true }),
      ).toHaveCount(0);
      await expect(otherPage.getByText('No records found', { exact: true })).toBeVisible();
      await otherVerify();
    } finally {
      await other.close();
    }
    await verify();
  });

  test('creates a lead and persists the original follow-up workflow', async ({
    page,
    context,
    baseURL,
  }) => {
    const verify = await observeDemo(context, new URL(baseURL!).origin);
    await login(page);
    const name = 'Demo Browser Lead';
    await createPerson(page, 'leads', name);
    await page.getByRole('button', { name: `View details: ${name}`, exact: true }).click();
    for (const [label, operation] of [
      ['Start follow-up', 'open'],
      ['Mark qualified', 'qualify'],
    ] as const) {
      await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/${operation}`) && response.request().method() === 'POST',
      );
      const action = page.getByRole('dialog').filter({
        has: page.getByRole('button', { name: 'Confirm action', exact: true }),
      });
      await action.getByRole('button', { name: 'Confirm action', exact: true }).click();
      await successfulResponse(saved);
      await expect(action).not.toBeVisible();
    }
    // Finish mutation-triggered list refreshes before replacing this document.
    await verify();
    await page.goto('/en/leads');
    await search(page, name);
    await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Qualified');
    await verify();
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Qualified');
    await verify();
  });

  test('persists notification changes through the original popover', async ({
    page,
    context,
    baseURL,
  }) => {
    const verify = await observeDemo(context, new URL(baseURL!).origin);
    await login(page);
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
    const cleared = page.waitForResponse(
      (response) =>
        response.url().includes('/notifications/') && response.request().method() !== 'GET',
    );
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    await successfulResponse(cleared);
    await expect(page.getByText('Nothing new right now', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(page.getByText('Nothing new right now', { exact: true })).toBeVisible();
    await verify();
  });

  for (const locale of ['en', 'ar'] as const) {
    for (const mobile of [false, true]) {
      test(`retains ${locale} original layouts and both themes on ${mobile ? 'mobile' : 'desktop'}`, async ({
        page,
        context,
        baseURL,
      }, testInfo) => {
        const verify = await observeDemo(context, new URL(baseURL!).origin);
        await page.setViewportSize(
          mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
        );
        await page.emulateMedia({ colorScheme: 'light' });
        await login(page, locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('[data-dashboard-canvas]')).toBeVisible();
        for (const theme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: theme });
          await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
          const widths = await page.evaluate(() => ({
            document: document.documentElement.scrollWidth,
            viewport: document.documentElement.clientWidth,
          }));
          expect(widths.document).toBeLessThanOrEqual(widths.viewport);
          await page.screenshot({
            path: testInfo.outputPath(`${locale}-${mobile ? 'mobile' : 'desktop'}-${theme}.png`),
            fullPage: true,
          });
        }
        if (mobile) {
          await page
            .getByRole('button', {
              name: locale === 'en' ? 'Open navigation' : 'فتح قائمة التنقل',
              exact: true,
            })
            .click();
          const menu = page.getByRole('dialog');
          await expect(menu).toBeVisible();
          await menu.locator(`a[href="/${locale}/students"]`).click();
          await expect(page).toHaveURL(`/${locale}/students`);
          await expect(page.locator('[data-academy-page="students"]')).toBeVisible();
        }
        await verify();
      });
    }
  }
});
