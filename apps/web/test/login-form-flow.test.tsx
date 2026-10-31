import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/features/auth/login-form';
import {
  ForgotPasswordScreen,
  ResetPasswordScreen,
} from '@/features/auth/password-recovery-screen';

const replace = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.location.hash = '';
  replace.mockClear();
  refresh.mockClear();
});

describe('phone login flow', () => {
  it('reuses the accepted password for resend and returns change-phone back to login', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        headers: { 'content-type': 'application/json' },
        status: 202,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onStepChange = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <LoginForm locale="en" onStepChange={onStepChange} organizationCode="ACADEMYOPS" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Phone' }));
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '1012345678' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Phone-password!42' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('group', { name: 'WhatsApp code' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestBodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse((init as RequestInit).body as string),
    );
    expect(requestBodies).toEqual([
      {
        organizationCode: 'ACADEMYOPS',
        password: 'Phone-password!42',
        phone: '+201012345678',
      },
      {
        organizationCode: 'ACADEMYOPS',
        password: 'Phone-password!42',
        phone: '+201012345678',
      },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Change phone number' }));
    expect(onStepChange).toHaveBeenLastCalledWith('changePhone');
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign-in details' }));
    expect(onStepChange).toHaveBeenLastCalledWith('credentials');
    expect(screen.getByRole('group', { name: 'Sign-in method' })).toBeInTheDocument();
  });
});

describe('remembered email login', () => {
  it('sends the remember-me choice through the generated login contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          expiresAt: '2026-09-29T00:00:00.000Z',
          mfaSetupRequired: false,
          passwordChangeRequired: false,
        }),
        { headers: { 'content-type': 'application/json' }, status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <LoginForm locale="en" organizationCode="ACADEMYOPS" />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@plg.local' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Strong-password!42' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toMatchObject({
      identifier: 'owner@plg.local',
      identifierType: 'EMAIL',
      rememberMe: true,
    });
  });

  it('submits a valid MFA code only once when duplicate form events fire', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      }),
    );
    let resolveMfaLogin: ((response: Response) => void) | undefined;
    const mfaLoginResponse = new Promise<Response>((resolve) => {
      resolveMfaLogin = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'MFA_REQUIRED', messageKey: 'auth.mfaRequired' }), {
          headers: { 'content-type': 'application/json' },
          status: 409,
        }),
      )
      .mockImplementationOnce(() => mfaLoginResponse);
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <LoginForm locale="en" organizationCode="ACADEMYOPS" />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@plg.local' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Strong-password!42' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const otpGroup = await screen.findByRole('group', { name: 'Verification code' });
    const otpInputs = Array.from(otpGroup.querySelectorAll('input'));
    expect(otpInputs).toHaveLength(6);
    otpInputs.forEach((input, index) => {
      fireEvent.change(input, { target: { value: '123456'.charAt(index) } });
    });

    const mfaForm = screen.getByRole('button', { name: 'Verify and continue' }).closest('form');
    expect(mfaForm).not.toBeNull();
    if (!mfaForm) throw new Error('MFA form was not rendered');
    fireEvent.submit(mfaForm);
    fireEvent.submit(mfaForm);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveMfaLogin?.(
        new Response(
          JSON.stringify({
            expiresAt: '2026-09-29T00:00:00.000Z',
            mfaSetupRequired: false,
            passwordChangeRequired: false,
          }),
          { headers: { 'content-type': 'application/json' }, status: 201 },
        ),
      );
    });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/dashboard'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('That verification code is not valid.')).not.toBeInTheDocument();
  });
});

describe('password recovery method pages', () => {
  it('keeps email recovery fixed and sends the visible page locale', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        headers: { 'content-type': 'application/json' },
        status: 202,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ForgotPasswordScreen locale="en" method="EMAIL" organizationCode="ACADEMYOPS" />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Phone' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@plg.local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send link by email' }));
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toMatchObject({ identifierType: 'EMAIL', locale: 'en' });
  });

  it('explains password reuse without presenting it as an unknown failure', async () => {
    window.location.hash =
      '#organizationCode=ACADEMYOPS&token=abcdefghijklmnopqrstuvwxyz1234567890ABCDE';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'PASSWORD_REUSE_FORBIDDEN',
          correlationId: 'password-reuse-correlation',
          fieldErrors: [],
          messageKey: 'auth.passwordReuseForbidden',
        }),
        { headers: { 'content-type': 'application/json' }, status: 409 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ResetPasswordScreen locale="en" />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'Existing-password!42' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'Existing-password!42' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await act(async () => {});

    expect(
      screen.getByText('Your new password must be different from your current password.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/password-reuse-correlation/)).not.toBeInTheDocument();
  });
});
