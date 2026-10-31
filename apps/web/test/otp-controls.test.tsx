import { PlgApiError } from '@academyops/api-client/http';
import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkspaceOverviewControllerOverviewV1QueryKey } from '@/api/generated/dashboard/dashboard';
import type { OtpChannelStatusDto } from '@/api/generated/models/otpChannelStatusDto';
import { executeChannelAction, readChannel, readPairingCode } from '@/api/system/commands';
import { systemKey } from '@/api/system/queries';
import { WhatsappPage } from '@/features/system/whatsapp-page';
import { systemText } from '@/i18n/system-copy';
import { otpUser } from './otp-user.fixture';

vi.mock('next/navigation', () => ({ usePathname: () => window.location.pathname }));
vi.mock('@/api/system/commands', () => ({
  readChannel: vi.fn(),
  readPairingCode: vi.fn(),
  executeChannelAction: vi.fn(),
}));
let client: QueryClient;
const status = (state: OtpChannelStatusDto['state'] = 'DISABLED'): OtpChannelStatusDto => ({
  provider: 'BAILEYS',
  state,
  enabled: state !== 'DISABLED',
  version: 4,
  needsQr: state === 'QR_REQUIRED',
  otpAvailable: state === 'CONNECTED',
  phoneMasked: '***1234',
  qrExpiresAt: new Date(Date.now() + 60000).toISOString(),
});
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
function mount(user = otpUser) {
  return render(
    <QueryClientProvider client={client}>
      <PlgMotionProvider>
        <WhatsappPage user={user} />
      </PlgMotionProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  document.documentElement.lang = 'en';
  window.history.replaceState(null, '', '/en/whatsapp');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(readChannel).mockResolvedValue(status());
  vi.mocked(readPairingCode).mockResolvedValue({
    qr: 'private-synthetic-pairing-credential',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  vi.mocked(executeChannelAction).mockResolvedValue(status('STARTING'));
  for (const name of ['ResizeObserver', 'IntersectionObserver'])
    vi.stubGlobal(
      name,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.lang = 'en';
});

describe('WhatsApp OTP using shared real components', () => {
  it('requires shared MFA verification before revealing the private pairing QR', async () => {
    vi.mocked(readChannel).mockResolvedValue(status('QR_REQUIRED'));
    vi.mocked(readPairingCode).mockRejectedValueOnce(
      new PlgApiError(403, { code: 'MFA_STEP_UP_REQUIRED', messageKey: 'auth.stepUpRequired' }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ verified: true })),
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Show pairing QR' }));
    const mfa = await screen.findByRole('dialog', { name: 'Confirm it is you' });
    expect(screen.queryByTitle('Show pairing QR')).not.toBeInTheDocument();
    fireEvent.change(within(mfa).getByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    });
    fireEvent.click(within(mfa).getByRole('button', { name: 'Verify and continue' }));
    expect(await screen.findByTitle('Show pairing QR')).toBeInTheDocument();
    expect(readPairingCode).toHaveBeenCalledTimes(2);
  });
  it.each(['en', 'ar'] as const)(
    'gives a pairing-specific recovery message for an unavailable QR in %s',
    async (locale) => {
      window.history.replaceState(null, '', `/${locale}/whatsapp`);
      vi.mocked(readChannel).mockResolvedValue(status('QR_REQUIRED'));
      vi.mocked(readPairingCode).mockRejectedValueOnce(
        new PlgApiError(409, {
          code: 'OTP_CHANNEL_QR_NOT_READY',
          messageKey: 'messaging.qrNotReady',
        }),
      );
      mount();
      fireEvent.click(await screen.findByRole('button', { name: systemText(locale, 'showQr') }));
      expect(await screen.findByText(systemText(locale, 'qrNotReady'))).toBeInTheDocument();
      expect(screen.queryByTitle(systemText(locale, 'showQr'))).not.toBeInTheDocument();
    },
  );
  it.each([
    'DISABLED',
    'STARTING',
    'QR_REQUIRED',
    'CONNECTED',
    'DISCONNECTED',
    'FAULTED',
    'STALE',
  ] as const)(
    'renders %s with relevant actions, never fetching QR automatically',
    async (state) => {
      vi.mocked(readChannel).mockResolvedValue(status(state));
      const { container } = mount();
      expect(await screen.findByText(systemText('en', state), { exact: true })).toBeInTheDocument();
      expect(container.querySelectorAll('[data-library-component="heroui/card"]')).toHaveLength(2);
      expect(screen.getByText(systemText('en', `channel${state}`))).toBeInTheDocument();
      expect(readPairingCode).not.toHaveBeenCalled();
      expect(Boolean(screen.queryByRole('button', { name: 'Connect channel' }))).toBe(
        !['CONNECTED', 'STARTING', 'QR_REQUIRED'].includes(state),
      );
      expect(Boolean(screen.queryByRole('button', { name: 'Disable channel' }))).toBe(
        state !== 'DISABLED',
      );
    },
  );
  it.each(['en', 'ar'] as const)(
    'keeps %s read-only access, semantic labels and locale direction',
    async (locale) => {
      window.history.replaceState(null, '', `/${locale}/whatsapp`);
      const { container } = mount({
        ...otpUser,
        permissions: [{ code: 'messaging.otp.read', scopes: ['O'] }],
      });
      await screen.findByText(systemText(locale, 'channelReadOnly'));
      expect(container.querySelector('[dir]')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      for (const action of ['connect', 'disable', 'reset', 'showQr'])
        expect(
          screen.queryByRole('button', { name: systemText(locale, action) }),
        ).not.toBeInTheDocument();
    },
  );
  it('validates the reason, freezes the reviewed version and suppresses duplicate commands', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect channel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Connect channel' });
    const submit = within(dialog).getByRole('button', { name: 'Connect channel' });
    fireEvent.click(submit);
    expect(executeChannelAction).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Reviewed synthetic reconnect' },
    });
    await act(async () => {
      client.setQueryData([...systemKey(otpUser.id), 'channel'], { ...status(), version: 8 });
    });
    let resolve!: (value: OtpChannelStatusDto) => void;
    vi.mocked(executeChannelAction).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(executeChannelAction).toHaveBeenCalledTimes(1));
    expect(executeChannelAction).toHaveBeenCalledWith(
      'connect',
      4,
      'Reviewed synthetic reconnect',
      expect.any(String),
    );
    expect(submit).toBeDisabled();
    await act(async () => resolve(status('STARTING')));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: [...getWorkspaceOverviewControllerOverviewV1QueryKey('OTP_OPERATOR'), otpUser.id],
    });
  });
});
