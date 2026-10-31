import { expect, test, type Page } from '@playwright/test';

async function fillCredentials(
  page: Page,
  values: { identifier?: string; password?: string } = {},
) {
  await expect(page.locator('[data-login-motion-state^="running:"]')).toHaveCount(1);
  await page
    .getByLabel('البريد الإلكتروني', { exact: true })
    .fill(values.identifier ?? 'owner@plg.test');
  await page.getByLabel('كلمة المرور', { exact: true }).fill(values.password ?? 'strong-password');
}

test('renders a polished localized login and uses the real login endpoint', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const response = await page.goto('/ar/login');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول إلى AcademyOps' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await fillCredentials(page);
  const rememberMe = page.getByRole('checkbox', { name: 'تذكرني' });
  await page.getByText('تذكرني', { exact: true }).click();
  await expect(rememberMe).toBeChecked();
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL('/ar/dashboard');
  expect(consoleErrors).toEqual([]);

  await page.context().clearCookies();
  await page.goto('/ar/login');
  await expect(page.getByLabel('البريد الإلكتروني', { exact: true })).toHaveValue('owner@plg.test');
  await page.screenshot({
    caret: 'initial',
    fullPage: true,
    path: testInfo.outputPath('login-desktop.png'),
  });
});

test('handles invalid credentials, MFA with Arabic digits, and rate limiting', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const submittedMfaCodes: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/api/v1/auth/login')) return;
    const body = request.postDataJSON() as { totpCode?: string };
    if (body.totpCode) submittedMfaCodes.push(body.totpCode);
  });
  await page.goto('/ar/login');
  await fillCredentials(page, { password: 'wrong-password' });
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  const invalidAlert = page.getByRole('alert').filter({ hasText: 'بيانات الدخول غير صحيحة' });
  await expect(invalidAlert).toContainText('corr-invalid-login');

  await page.getByLabel('البريد الإلكتروني', { exact: true }).fill('mfa@plg.test');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('strong-password');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page.getByRole('heading', { name: 'التحقق بخطوتين' })).toBeVisible();
  await expect(page.locator('[data-login-step-motion]')).toHaveAttribute(
    'data-login-step-motion',
    'complete:mfa:desktop',
  );
  const otpGaps = await page
    .locator('input[autocomplete="one-time-code"]')
    .evaluateAll((inputs) => {
      const boxes = inputs
        .map((input) => input.getBoundingClientRect())
        .sort((left, right) => left.x - right.x);
      return boxes.slice(1).map((box, index) => Math.round(box.x - boxes[index]!.right));
    });
  expect(Math.max(...otpGaps) - Math.min(...otpGaps)).toBeLessThanOrEqual(1);
  await page.screenshot({
    caret: 'initial',
    fullPage: true,
    path: testInfo.outputPath('login-mfa.png'),
  });
  const otp = page.getByRole('textbox', { name: /الرقم/ });
  for (const [index, digit] of ['١', '٢', '٣', '٤', '٥', '٦'].entries()) {
    await otp.nth(index).fill(digit);
  }
  await page.getByRole('button', { name: 'تحقق وتابع' }).evaluate((button) => {
    const form = button.closest('form');
    form?.requestSubmit();
    form?.requestSubmit();
  });
  await expect(page).toHaveURL('/ar/dashboard');
  expect(submittedMfaCodes).toEqual(['123456']);

  await page.context().clearCookies();
  await page.goto('/ar/login');
  await fillCredentials(page, { identifier: 'rate-limit@plg.test' });
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  const rateLimitAlert = page.getByRole('alert').filter({ hasText: 'محاولات كثيرة' });
  await expect(rateLimitAlert).toContainText('corr-rate-limit');
  await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeDisabled();
  expect(
    consoleErrors.filter((message) => !message.startsWith('Failed to load resource:')),
  ).toEqual([]);
});

test('runs visible GSAP motion for entrance and credential interactions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const motionWindow = window as typeof window & { __loginEntranceSamples?: string[] };
    motionWindow.__loginEntranceSamples = [];
    const attachObserver = () => {
      const panel = document.querySelector('[data-login-panel]');
      if (!panel) return window.requestAnimationFrame(attachObserver);
      const observer = new MutationObserver(() => {
        const style = panel.getAttribute('style');
        if (style) motionWindow.__loginEntranceSamples?.push(style);
      });
      observer.observe(panel, { attributeFilter: ['style'], attributes: true, subtree: true });
      return undefined;
    };
    attachObserver();
  });

  await page.goto('/en/login');
  await page.waitForTimeout(1_100);
  const entranceSamples = await page.evaluate(
    () =>
      (window as typeof window & { __loginEntranceSamples?: string[] }).__loginEntranceSamples ??
      [],
  );
  const motionState = await page
    .locator('[data-login-motion-state]')
    .getAttribute('data-login-motion-state');
  expect(
    entranceSamples.some((style) => style.includes('transform')),
    JSON.stringify({ motionState, samples: entranceSamples.slice(0, 12) }),
  ).toBe(true);
  expect(
    entranceSamples.some((style) => style.includes('opacity')),
    JSON.stringify(entranceSamples.slice(0, 12)),
  ).toBe(true);

  const identifierField = page.locator('[data-login-identifier-field]');
  const identifierSamples = await identifierField.evaluate((element) => {
    const samples: string[] = [];
    new MutationObserver(() => samples.push(element.getAttribute('style') ?? '')).observe(element, {
      attributeFilter: ['style'],
      attributes: true,
    });
    (window as typeof window & { __identifierMotionSamples?: string[] }).__identifierMotionSamples =
      samples;
    return samples;
  });
  expect(identifierSamples).toEqual([]);
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await page.waitForTimeout(450);
  const switchSamples = await page.evaluate(
    () =>
      (window as typeof window & { __identifierMotionSamples?: string[] })
        .__identifierMotionSamples ?? [],
  );
  expect(switchSamples.some((style) => style.includes('translate'))).toBe(true);
});

test('animates the MFA entrance, method switch, and OTP edits with GSAP', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/en/login');
  await expect(page.locator('[data-login-motion-state^="running:"]')).toHaveCount(1);
  await page.getByLabel('Email', { exact: true }).fill('mfa@plg.test');
  await page.getByLabel('Password', { exact: true }).fill('strong-password');

  await page.locator('[data-login-panel]').evaluate((panel) => {
    const samples: string[] = [];
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof HTMLElement)
          samples.push(record.target.getAttribute('style') ?? '');
      }
    }).observe(panel, { attributeFilter: ['style'], attributes: true, subtree: true });
    (window as typeof window & { __mfaStepMotionSamples?: string[] }).__mfaStepMotionSamples =
      samples;
  });

  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
  await expect(page.locator('[data-login-step-motion]')).toHaveAttribute(
    'data-login-step-motion',
    'complete:mfa:desktop',
  );
  const verticalGaps = await page.locator('[data-login-mfa-method-content]').evaluate((content) => {
    const label = content.querySelector('[data-login-mfa-code-label]')?.getBoundingClientRect();
    const otp = content
      .querySelector('fieldset[aria-label="Verification code"]')
      ?.getBoundingClientRect();
    const hint = content.querySelector('[data-login-mfa-code-hint]')?.getBoundingClientRect();
    if (!label || !otp || !hint) return null;
    return {
      hintFromOtp: Math.round(hint.top - otp.bottom),
      otpFromLabel: Math.round(otp.top - label.bottom),
    };
  });
  expect(verticalGaps).toEqual({ hintFromOtp: 10, otpFromLabel: 10 });
  const stepSamples = await page.evaluate(
    () =>
      (window as typeof window & { __mfaStepMotionSamples?: string[] }).__mfaStepMotionSamples ??
      [],
  );
  expect(stepSamples.some((style) => style.includes('transform'))).toBe(true);
  expect(stepSamples.some((style) => style.includes('opacity'))).toBe(true);

  const mfaForm = page.locator('form[data-login-mfa-method-motion], form').filter({
    has: page.getByRole('button', { name: 'Authenticator app', exact: true }),
  });
  const methodContent = page.locator('[data-login-mfa-method-content]');
  await methodContent.evaluate((content) => {
    const samples: string[] = [];
    new MutationObserver(() => samples.push(content.getAttribute('style') ?? '')).observe(content, {
      attributeFilter: ['style'],
      attributes: true,
    });
    (window as typeof window & { __mfaMethodMotionSamples?: string[] }).__mfaMethodMotionSamples =
      samples;
  });
  await page.getByRole('button', { name: 'Recovery code', exact: true }).click();
  await expect(page.getByPlaceholder('XXXX-XXXX-XXXX-XXXX-XXXX')).toBeVisible();
  await expect(mfaForm).toHaveAttribute(
    'data-login-mfa-method-motion',
    'complete:recovery:desktop',
  );
  const methodSamples = await page.evaluate(
    () =>
      (window as typeof window & { __mfaMethodMotionSamples?: string[] })
        .__mfaMethodMotionSamples ?? [],
  );
  expect(methodSamples.some((style) => style.includes('transform'))).toBe(true);
  expect(methodSamples.some((style) => style.includes('opacity'))).toBe(true);

  await page.getByRole('button', { name: 'Authenticator app', exact: true }).click();
  await expect(mfaForm).toHaveAttribute('data-login-mfa-method-motion', 'complete:totp:desktop');
  const firstDigit = page.getByRole('textbox', { name: 'Digit 1 of 6' });
  await firstDigit.evaluate((input) => {
    const samples: string[] = [];
    new MutationObserver(() => samples.push(input.getAttribute('style') ?? '')).observe(input, {
      attributeFilter: ['style'],
      attributes: true,
    });
    (window as typeof window & { __otpMotionSamples?: string[] }).__otpMotionSamples = samples;
  });

  await firstDigit.fill('1');
  await expect(firstDigit).toHaveAttribute('data-otp-state', 'filled');
  await page.waitForTimeout(300);
  await firstDigit.press('Backspace');
  await expect(firstDigit).toHaveAttribute('data-otp-state', 'empty');
  await page.waitForTimeout(260);
  const otpSamples = await page.evaluate(
    () => (window as typeof window & { __otpMotionSamples?: string[] }).__otpMotionSamples ?? [],
  );
  expect(otpSamples.some((style) => style.includes('transform'))).toBe(true);
  expect(otpSamples.some((style) => style.includes('opacity'))).toBe(true);
  await expect
    .poll(() =>
      firstDigit.evaluate((input) => {
        const style = getComputedStyle(input);
        return { opacity: style.opacity, transform: style.transform };
      }),
    )
    .toEqual({ opacity: '1', transform: 'none' });
});
