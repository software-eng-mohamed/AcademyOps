import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  credentialsFor,
  dashboardPath,
  E2E_BASE_URL,
  E2E_ORGANIZATION_CODE,
  type E2ERole,
  type FixtureRole,
} from './environment';
import { currentTotp } from './totp';

const lastTotpCounter = new Map<FixtureRole, number>();

async function waitForNextTotpWindow() {
  await new Promise((resolve) => setTimeout(resolve, 30_250 - (Date.now() % 30_000)));
}

export interface SyntheticProfile {
  organization?: { id?: unknown; code?: unknown; name?: unknown };
  roles?: Array<{ code?: unknown }>;
  permissions?: Array<{ code?: unknown }>;
  onboardingCompleted?: boolean;
  passwordChangeRequired?: boolean;
}

export async function authenticateSynthetic(
  page: Page,
  role: FixtureRole,
): Promise<SyntheticProfile> {
  const credentials = credentialsFor(role);
  if (credentials.totpSecret) {
    const counter = Math.floor(Date.now() / 30_000);
    if (lastTotpCounter.get(role) === counter) await waitForNextTotpWindow();
  }
  const login = () => {
    if (credentials.totpSecret) lastTotpCounter.set(role, Math.floor(Date.now() / 30_000));
    return page.request.post('/api/v1/auth/login', {
      data: {
        organizationCode: E2E_ORGANIZATION_CODE,
        identifierType: 'EMAIL',
        identifier: credentials.email,
        password: credentials.password,
        ...(credentials.totpSecret ? { totpCode: currentTotp(credentials.totpSecret) } : {}),
      },
      headers: { origin: E2E_BASE_URL, 'x-correlation-id': randomUUID() },
    });
  };
  let response = await login();
  // Synthetic TOTP accounts deliberately reject replay inside the same 30-second
  // window. A restarted Playwright worker cannot retain the previous counter, so
  // wait for one fresh code and retry only this test-only authentication request.
  if (response.status() === 401 && credentials.totpSecret) {
    await waitForNextTotpWindow();
    response = await login();
  }
  if (response.status() !== 201) {
    const payload = (await response.json().catch(() => null)) as { code?: unknown } | null;
    throw new Error(
      `Synthetic ${role} login failed with HTTP ${response.status()}${typeof payload?.code === 'string' ? ` (${payload.code})` : ''}.`,
    );
  }
  const me = await page.request.get('/api/v1/auth/me');
  if (me.status() !== 200) throw new Error('Synthetic tenant identity verification failed.');
  const payload: unknown = await me.json();
  const tenant = payload as SyntheticProfile;
  const organizationName = tenant.organization?.name;
  if (
    tenant.organization?.code !== E2E_ORGANIZATION_CODE ||
    typeof organizationName !== 'string' ||
    !['SYNTHETIC E2E', 'بيانات اختبار صناعية'].some((marker) => organizationName.includes(marker))
  ) {
    throw new Error('Authenticated tenant is not the marker-verified synthetic organization.');
  }
  return tenant;
}

export async function loginAs(page: Page, role: E2ERole): Promise<void> {
  const path = dashboardPath();
  await authenticateSynthetic(page, role);
  await page.goto(path);
  expect(page.url(), 'fixture accounts must have completed onboarding').not.toContain(
    '/onboarding',
  );
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}(?:\\?|$)`));
}
