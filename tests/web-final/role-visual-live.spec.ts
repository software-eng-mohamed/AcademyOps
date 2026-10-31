import { expect, type Page, test } from '@playwright/test';
import type { FixtureRole } from '../e2e/support/environment';
import { authenticateSynthetic } from '../e2e/support/login';
import { expectAccessible, expectLoadedWorkspace, expectNoBodyOverflow } from './live-helpers';

const roles = [
  ['owner', '/dashboard'],
  ['operations', '/dashboard'],
  ['academic', '/dashboard'],
  ['reception', '/dashboard'],
  ['sales', '/dashboard'],
  ['accounts', '/dashboard'],
  ['attendance', '/dashboard'],
  ['trainer', '/dashboard'],
  ['student', '/dashboard'],
  ['otp_operator', '/whatsapp'],
  ['no_grant', '/dashboard'],
] as const satisfies ReadonlyArray<readonly [FixtureRole, string]>;

const viewports = [
  { height: 1000, label: '1440', width: 1440 },
  { height: 900, label: '1024', width: 1024 },
  { height: 844, label: '390', width: 390 },
] as const;
const locales = ['en', 'ar'] as const;
const themes = ['light', 'dark'] as const;

async function stabilize(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-duration: 0s !important;
      }
      button[aria-label="Open Tanstack query devtools"] { display: none !important; }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expectLoadedWorkspace(page);
  await expectNoBodyOverflow(page);
}

async function expectOwnerCopyAndLabels(
  page: Page,
  locale: 'en' | 'ar',
  activityCounts: { students: number; people: number },
) {
  await expect(page.getByText('student.create', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Person', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(locale === 'ar' ? 'تمت إضافة طالب' : 'Student added', { exact: true }),
  ).toHaveCount(activityCounts.students);
  await expect(page.getByText(locale === 'ar' ? 'الأشخاص' : 'People', { exact: true })).toHaveCount(
    activityCounts.people,
  );
  const label = locale === 'ar' ? 'الحضور أقل من الحد الأدنى' : 'Attendance below minimum';
  const tick = page.locator('svg foreignObject').filter({ hasText: label });
  await expect(tick).toHaveCount(1);
  await expect(tick.locator('div').first()).toHaveText(label);
  const bounds = await tick.evaluate((element) => {
    const svg = element.closest('svg');
    const text = element.querySelector('div');
    if (!svg || !text) throw new Error('The complete category label must render inside its SVG.');
    const box = element.getBoundingClientRect();
    const canvas = svg.getBoundingClientRect();
    return {
      left: box.left - canvas.left,
      right: canvas.right - box.right,
      top: box.top - canvas.top,
      bottom: canvas.bottom - box.bottom,
      textWidth: text.scrollWidth,
      availableWidth: text.clientWidth,
      textHeight: text.scrollHeight,
      availableHeight: text.clientHeight,
    };
  });
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    expect(
      bounds[edge],
      `${locale} category label ${edge} edge stays within the chart`,
    ).toBeGreaterThanOrEqual(-1);
  }
  expect(bounds.textWidth).toBeLessThanOrEqual(bounds.availableWidth + 1);
  expect(bounds.textHeight).toBeLessThanOrEqual(bounds.availableHeight + 1);
}

for (const [role, route] of roles) {
  test(`${role} workspace renders both languages, themes and viewport sizes with Axe checks`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await authenticateSynthetic(page, role);
    const activityCounts = { students: 0, people: 0 };
    if (role === 'owner') {
      const response = await page.request.get('/api/v1/dashboard/overview');
      expect(response.status()).toBe(200);
      const overview = (await response.json()) as {
        recentActivity: Array<{ actionCode: string; entityType: string }>;
      };
      const visibleActivity = overview.recentActivity.slice(0, 5);
      activityCounts.students = visibleActivity.filter(
        (event) => event.actionCode === 'student.create',
      ).length;
      activityCounts.people = visibleActivity.filter(
        (event) => event.entityType === 'Person',
      ).length;
    }

    for (const locale of locales) {
      for (const theme of themes) {
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          const response = await page.goto(`/${locale}${route}`);
          expect(response?.status()).toBe(200);
          await page.evaluate((nextTheme) => localStorage.setItem('theme', nextTheme), theme);
          await page.reload();
          await expect(page.locator('html')).toHaveAttribute(
            'dir',
            locale === 'ar' ? 'rtl' : 'ltr',
          );
          await expect(page.locator('html')).toHaveClass(new RegExp(theme));
          await stabilize(page);
          if (route === '/dashboard' && role !== 'no_grant') {
            await expect(
              page.locator(`[data-overview-role="${role.toUpperCase()}"]`),
            ).toBeVisible();
          }
          if (role === 'owner') await expectOwnerCopyAndLabels(page, locale, activityCounts);

          const name = `${role}-${locale}-${theme}-${viewport.label}.png`;
          const path = testInfo.outputPath(name);
          await page.screenshot({
            animations: 'disabled',
            caret: 'hide',
            fullPage: true,
            path,
          });
          await testInfo.attach(name, { path, contentType: 'image/png' });

          const axeGate =
            (locale === 'en' && theme === 'light' && viewport.label === '1440') ||
            (locale === 'ar' && theme === 'dark' && viewport.label === '390');
          if (axeGate) {
            await expectAccessible(page, testInfo, `${role}-${locale}-${theme}-${viewport.label}`);
          }
        }
      }
    }
  });
}
