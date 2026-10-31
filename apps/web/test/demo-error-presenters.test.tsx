import { PlgApiError } from '@academyops/api-client/http';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorNotice } from '@/features/academy/academy-ui';
import { ForgotPasswordScreen } from '@/features/auth/forgot-password-screen';
import { getLoginCopy } from '@/features/auth/login-copy';
import { loginErrorView } from '@/features/auth/login-error';
import { getPasswordRecoveryCopy } from '@/features/auth/password-recovery-copy';
import { passwordResetError, recoveryError } from '@/features/auth/password-recovery-parts';
import { getAcademyCopy } from '@/i18n/academy-copy';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(['en', 'ar'] as const)('%s demo error presenters', (locale) => {
  it.each([
    ['DEMO_STORAGE_LIMIT', 'demoStorageLimit', 409],
    ['DEMO_ACTION_UNAVAILABLE', 'demoActionUnavailable', 422],
  ] as const)('explains %s across operation, login, and recovery forms', (code, key, status) => {
    const error = new PlgApiError(status, {
      code,
      messageKey: 'demo.error',
      correlationId: 'demo-tracking',
    });
    const academy = getAcademyCopy(locale);
    render(<ErrorNotice copy={academy} error={error} />);
    expect(screen.getByRole('alert')).toHaveTextContent(academy[key]);
    expect(screen.getByRole('alert')).toHaveTextContent('demo-tracking');
    expect(screen.getByRole('alert')).not.toHaveTextContent(academy.requestRejected);
    const login = getLoginCopy(locale);
    expect(loginErrorView(error, login)).toEqual({
      message: login[key],
      correlationId: 'demo-tracking',
    });
    const recovery = getPasswordRecoveryCopy(locale);
    for (const present of [recoveryError, passwordResetError]) {
      expect(present(error, recovery)).toEqual({
        message: recovery[key],
        correlationId: 'demo-tracking',
      });
    }
  });

  it.each(['EMAIL', 'PHONE'] as const)(
    'does not claim a %s recovery message was sent when the demo blocks delivery',
    async (method) => {
      const copy = getPasswordRecoveryCopy(locale);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              code: 'DEMO_ACTION_UNAVAILABLE',
              messageKey: 'demo.actionUnavailable',
            }),
            { status: 422, headers: { 'content-type': 'application/json' } },
          ),
        ),
      );
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <ForgotPasswordScreen locale={locale} method={method} organizationCode="ACADEMYOPS" />
        </QueryClientProvider>,
      );
      fireEvent.change(screen.getByLabelText(method === 'EMAIL' ? copy.email : copy.phone), {
        target: { value: method === 'EMAIL' ? 'visitor@example.invalid' : '1012345678' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: method === 'EMAIL' ? copy.sendEmailLink : copy.sendPhoneLink,
        }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(copy.demoActionUnavailable);
      expect(screen.queryByText(copy.acceptedTitle)).not.toBeInTheDocument();
      expect(screen.getByLabelText(method === 'EMAIL' ? copy.email : copy.phone)).toBeEnabled();
      client.clear();
    },
  );
});
