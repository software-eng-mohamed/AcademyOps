import { PlgApiError } from '@academyops/api-client/http';
import { PlgMotionProvider } from '@academyops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OtpChannelStatusDto } from '@/api/generated/models/otpChannelStatusDto';
import { executeChannelAction, readChannel, readPairingCode } from '@/api/system/commands';
import { systemKey } from '@/api/system/queries';
import { WhatsappPage } from '@/features/system/whatsapp-page';
import { getAcademyCopy } from '@/i18n/academy-copy';
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
  it.each(['disable', 'reset'] as const)(
    'requires explicit %s confirmation and an audit reason',
    async (action) => {
      vi.mocked(readChannel).mockResolvedValue(status('CONNECTED'));
      mount();
      fireEvent.click(await screen.findByRole('button', { name: systemText('en', action) }));
      const dialog = await screen.findByRole('dialog', { name: systemText('en', action) });
      expect(within(dialog).getByText(systemText('en', `${action}Hint`))).toBeInTheDocument();
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), {
        target: { value: 'Reviewed the synthetic channel' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: systemText('en', action) }));
      await waitFor(() =>
        expect(executeChannelAction).toHaveBeenCalledWith(
          action,
          4,
          'Reviewed the synthetic channel',
          expect.any(String),
        ),
      );
    },
  );
  it('removes private QR on close and on a connection transition without caching the credential', async () => {
    vi.mocked(readChannel).mockResolvedValue(status('QR_REQUIRED'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Show pairing QR' }));
    await screen.findByTitle('Show pairing QR');
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('private-synthetic-pairing-credential');
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Show pairing QR' })).getByRole('button', {
        name: 'Close',
      }),
    );
    await waitFor(() => expect(screen.queryByTitle('Show pairing QR')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Show pairing QR' }));
    await screen.findByTitle('Show pairing QR');
    await act(async () => {
      client.setQueryData([...systemKey(otpUser.id), 'channel'], status('CONNECTED'));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await act(async () => {
      client.setQueryData([...systemKey(otpUser.id), 'channel'], status('QR_REQUIRED'));
    });
    expect(readPairingCode).toHaveBeenCalledTimes(2);
    expect(screen.queryByTitle('Show pairing QR')).not.toBeInTheDocument();
  });
  it('expires the QR in memory and requires an explicit retry for another credential', async () => {
    vi.mocked(readChannel).mockResolvedValue(status('QR_REQUIRED'));
    vi.mocked(readPairingCode).mockResolvedValue({
      qr: 'private-synthetic-pairing-credential',
      expiresAt: new Date(Date.now() + 1500).toISOString(),
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Show pairing QR' }));
    await screen.findByTitle('Show pairing QR');
    await waitFor(() => expect(screen.queryByTitle('Show pairing QR')).not.toBeInTheDocument(), {
      timeout: 2500,
    });
    expect(screen.getByText(systemText('en', 'qrExpired'))).toBeInTheDocument();
    expect(readPairingCode).toHaveBeenCalledTimes(1);
  });
  it('opens the shared MFA form and reuses the command key after step-up', async () => {
    vi.mocked(executeChannelAction).mockRejectedValueOnce(
      new PlgApiError(403, { code: 'MFA_STEP_UP_REQUIRED', messageKey: 'auth.stepUpRequired' }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ verified: true })),
    );
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect channel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Connect channel' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), {
      target: { value: 'Reviewed synthetic MFA operation' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect channel' }));
    const mfa = await screen.findByRole('dialog', { name: 'Confirm it is you' });
    fireEvent.change(within(mfa).getByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    });
    fireEvent.click(within(mfa).getByRole('button', { name: 'Verify and continue' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Confirm it is you' })).not.toBeInTheDocument(),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect channel' }));
    await waitFor(() => expect(executeChannelAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(executeChannelAction).mock.calls[1]?.[3]).toBe(
      vi.mocked(executeChannelAction).mock.calls[0]?.[3],
    );
  });
  it('hides prior channel data and controls on access loss, then supports a manual retry', async () => {
    mount();
    await screen.findByText('***1234');
    vi.mocked(readChannel).mockRejectedValueOnce(
      new PlgApiError(403, { code: 'PERMISSION_DENIED', messageKey: 'auth.denied' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh status' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('***1234')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset pairing' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: getAcademyCopy('en').retry }));
    expect(await screen.findByText('***1234')).toBeInTheDocument();
  });
});
