import { expect, test } from '@playwright/test';

test('uses the lightweight MFA timelines on mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/login');
  await expect(page.locator('[data-login-motion-state^="running:"]')).toHaveCount(1);
  await page.getByLabel('Email', { exact: true }).fill('mfa@plg.test');
  await page.getByLabel('Password', { exact: true }).fill('strong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.locator('[data-login-step-motion]')).toHaveAttribute(
    'data-login-step-motion',
    'complete:mfa:mobile',
  );
  const methodContent = page.locator('[data-login-mfa-method-content]');
  await methodContent.evaluate((content) => {
    const samples: string[] = [];
    new MutationObserver(() => samples.push(content.getAttribute('style') ?? '')).observe(content, {
      attributeFilter: ['style'],
      attributes: true,
    });
    (window as typeof window & { __mobileMfaMotionSamples?: string[] }).__mobileMfaMotionSamples =
      samples;
  });
  await page.getByRole('button', { name: 'Recovery code', exact: true }).click();
  await expect(page.locator('form')).toHaveAttribute(
    'data-login-mfa-method-motion',
    'complete:recovery:mobile',
  );
  const samples = await page.evaluate(
    () =>
      (window as typeof window & { __mobileMfaMotionSamples?: string[] })
        .__mobileMfaMotionSamples ?? [],
  );
  expect(samples.some((style) => style.includes('transform'))).toBe(true);
  expect(samples.some((style) => style.includes('blur('))).toBe(false);
});

test('does not replay the method-switch animation after refreshing from Phone', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/en/login');
  await page.waitForTimeout(1_100);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  const phone = page.getByLabel('Phone', { exact: true });
  await expect(phone).toBeFocused();
  await expect(
    page.locator('[data-login-identifier-field]').getByText('+20', { exact: true }),
  ).toBeVisible();
  await expect(phone).toHaveAttribute('placeholder', '10 0000 0000');
  await phone.fill('+20 10 1234 5678');
  await expect(phone).toHaveValue('10 1234 5678');

  await page.addInitScript(() => {
    const motionWindow = window as typeof window & { __identifierRefreshSamples?: string[] };
    motionWindow.__identifierRefreshSamples = [];
    const captureIdentifierMotion = () => {
      const field = document.querySelector('[data-login-identifier-field]');
      if (!field) {
        window.requestAnimationFrame(captureIdentifierMotion);
        return;
      }
      const observer = new MutationObserver(() => {
        motionWindow.__identifierRefreshSamples?.push(field.getAttribute('style') ?? '');
      });
      observer.observe(field, { attributeFilter: ['style'], attributes: true });
    };
    captureIdentifierMotion();
  });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Email', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForTimeout(1_100);

  const refreshSamples = await page.evaluate(
    () =>
      (window as typeof window & { __identifierRefreshSamples?: string[] })
        .__identifierRefreshSamples ?? [],
  );
  expect(
    refreshSamples.some((style) => style.includes('blur(')),
    JSON.stringify(refreshSamples.slice(0, 20)),
  ).toBe(false);
  await expect
    .poll(() =>
      page.locator('[data-login-identifier-field]').evaluate((element) => {
        const style = getComputedStyle(element);
        return { filter: style.filter, opacity: style.opacity, transform: style.transform };
      }),
    )
    .toEqual({ filter: 'none', opacity: '1', transform: 'none' });
});

test('requests and verifies a WhatsApp code for an Egyptian phone', async ({ page }) => {
  await page.goto('/en/login');
  await expect(page.locator('[data-login-motion-state^="running:"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  const identifierField = page.locator('[data-login-identifier-field]');
  const phone = page.getByLabel('Phone', { exact: true });

  await expect(identifierField.getByText('+20', { exact: true })).toBeVisible();
  await expect(phone).toHaveAttribute('placeholder', '10 0000 0000');
  await phone.fill('010 1234 5678');
  await expect(phone).toHaveValue('10 1234 5678');
  await page.getByLabel('Password', { exact: true }).fill('strong-password');

  const otpRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/api/v1/auth/phone-otp/request'),
  );
  await page.getByRole('button', { name: 'Sign in' }).click();
  const requestBody = (await otpRequest).postDataJSON() as Record<string, unknown>;
  expect(requestBody).toEqual({
    organizationCode: 'ACADEMYOPS',
    password: 'strong-password',
    phone: '+201012345678',
  });

  await expect(page.getByRole('heading', { name: 'Check WhatsApp' })).toBeVisible();
  await expect(page.getByText('+201012345678', { exact: true })).toBeVisible();
  const otpDigits = page.locator('fieldset[aria-label="WhatsApp code"] input');
  await otpDigits.first().fill('111111');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(
    page.getByText('That WhatsApp code is invalid or has expired.').first(),
  ).toBeVisible();

  await otpDigits.first().fill('654321');
  const verifyRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/api/v1/auth/phone-otp/verify'),
  );
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  const verifyBody = (await verifyRequest).postDataJSON() as Record<string, unknown>;
  expect(verifyBody).toMatchObject({
    code: '654321',
    organizationCode: 'ACADEMYOPS',
    phone: '+201012345678',
  });
  await expect(page).toHaveURL(/\/en\/dashboard/);
});

test('switches locales without replaying a page transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/en/login');
  await page.locator('[data-login-panel]').evaluate((panel) => {
    const samples: string[] = [];
    new MutationObserver(() => samples.push(panel.getAttribute('style') ?? '')).observe(panel, {
      attributeFilter: ['style'],
      attributes: true,
    });
    (window as typeof window & { __localeMotionSamples?: string[] }).__localeMotionSamples =
      samples;
  });

  await page.getByRole('link', { name: 'العربية' }).click();
  await expect(page).toHaveURL('/ar/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول إلى AcademyOps' })).toBeVisible();
  const samples = await page.evaluate(
    () =>
      (window as typeof window & { __localeMotionSamples?: string[] }).__localeMotionSamples ?? [],
  );
  expect(samples).toEqual([]);
  await expect(page.locator('[data-login-motion-state="running:locale"]')).toHaveCount(0);
  await expect(page.locator('[data-login-motion-state="running:desktop"]')).toHaveCount(1);
});

test('keeps the English login usable on a mobile viewport', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/login');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { name: 'Log in to AcademyOps' })).toBeVisible();
  await expect(page.getByLabel('Organization code')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Remember me' })).toBeVisible();
  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible();
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(page.getByLabel('Phone', { exact: true })).toBeFocused();
  await expect
    .poll(() =>
      page.locator('[data-login-identifier-field]').evaluate((element) => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, transform: style.transform };
      }),
    )
    .toEqual({ opacity: '1', transform: 'none' });
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
  const motionState = await page
    .locator('[data-login-controls], [data-login-panel]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, transform: style.transform };
      }),
    );
  expect(motionState).toEqual([
    { opacity: '1', transform: 'none' },
    { opacity: '1', transform: 'none' },
  ]);
  await page.screenshot({
    caret: 'initial',
    fullPage: true,
    path: testInfo.outputPath('login-mobile.png'),
  });
  expect(consoleErrors).toEqual([]);
});
