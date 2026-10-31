import { expect, test } from '@playwright/test';
import { authenticateSynthetic } from '../e2e/support/login';
import { expectAccessible, expectLoadedWorkspace } from './live-helpers';

// Pairing and delivery require a separately provisioned external WhatsApp account.
// This suite verifies the real configured channel without starting the connector,
// obtaining pairing credentials, or sending messages.
test('WhatsApp displays real channel availability and refreshes without provider mutations', async ({
  page,
}, testInfo) => {
  await authenticateSynthetic(page, 'otp_operator');
  const channelPath = '/api/v1/messaging/otp-channel';
  const unsafeRequests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith(channelPath) && (request.method() !== 'GET' || path !== channelPath)) {
      unsafeRequests.push(`${request.method()} ${path}`);
    }
  });
  const read = () =>
    page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && new URL(response.url()).pathname === channelPath,
    );
  const initialRead = read();
  expect((await page.goto('/en/whatsapp'))?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'WhatsApp OTP', exact: true })).toBeVisible();
  const initial = await initialRead;
  expect(initial.status()).toBe(200);
  const channel = (await initial.json()) as {
    state: string;
    enabled: boolean;
    otpAvailable: boolean;
  };
  expect([
    'DISABLED',
    'STARTING',
    'QR_REQUIRED',
    'CONNECTED',
    'DISCONNECTED',
    'STALE',
    'FAULTED',
  ]).toContain(channel.state);
  expect(typeof channel.enabled).toBe('boolean');
  expect(typeof channel.otpAvailable).toBe('boolean');
  if (!channel.enabled) expect(channel.otpAvailable).toBe(false);
  await expectLoadedWorkspace(page);
  await expect(page.getByRole('heading', { name: 'Channel health', exact: true })).toBeVisible();
  const refreshed = read();
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  expect((await refreshed).status()).toBe(200);
  await expectLoadedWorkspace(page);
  expect(unsafeRequests).toEqual([]);
  await expectAccessible(page, testInfo, 'whatsapp-channel');
});
