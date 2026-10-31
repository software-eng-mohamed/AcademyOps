import { PlgApiError } from '@academyops/api-client/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLoginCopy } from '@/features/auth/login-copy';
import { loginErrorView } from '@/features/auth/login-error';
import { createLoginSchema } from '@/features/auth/login-schema';
import { getPasswordRecoveryCopy } from '@/features/auth/password-recovery-copy';
import { createPasswordResetSchema } from '@/features/auth/password-reset-schema';
import {
  formatEgyptPhoneLocalInput,
  normalizeEgyptPhoneLocalInput,
  toEgyptPhoneIdentifier,
} from '@/features/auth/phone-identifier';
import { readRememberedLogin, writeRememberedLogin } from '@/features/auth/remembered-login';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('login foundation', () => {
  it('validates email and phone credentials without exposing tenant configuration', () => {
    const schema = createLoginSchema(getLoginCopy('ar'));
    expect(
      schema.safeParse({
        identifier: 'owner@plg.test',
        identifierType: 'EMAIL',
        password: 'strong-password',
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        identifier: 'not-an-email',
        identifierType: 'EMAIL',
        password: 'short',
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        identifier: '10 1234 5678',
        identifierType: 'PHONE',
        password: 'strong-password',
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        identifier: '12 34',
        identifierType: 'PHONE',
        password: 'strong-password',
      }).success,
    ).toBe(false);
  });

  it('validates each password-reset field with the same schema-driven input contract', () => {
    const copy = getPasswordRecoveryCopy('en');
    const schema = createPasswordResetSchema(copy);
    expect(schema.safeParse({ confirmation: '', password: '' }).success).toBe(false);
    expect(
      schema.safeParse({ confirmation: 'StrongPassword#2026', password: 'short' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ confirmation: 'DifferentPassword#2026', password: 'StrongPassword#2026' })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ confirmation: 'StrongPassword#2026', password: 'StrongPassword#2026' })
        .success,
    ).toBe(true);
  });

  it('keeps the Egypt prefix fixed while accepting local and pasted international numbers', () => {
    expect(normalizeEgyptPhoneLocalInput('010 1234 5678')).toBe('1012345678');
    expect(normalizeEgyptPhoneLocalInput('+20 10 1234 5678')).toBe('1012345678');
    expect(normalizeEgyptPhoneLocalInput('٠١٠ ١٢٣٤ ٥٦٧٨')).toBe('1012345678');
    expect(formatEgyptPhoneLocalInput('+20 10 1234 5678')).toBe('10 1234 5678');
    expect(toEgyptPhoneIdentifier('10 1234 5678')).toBe('+201012345678');
  });

  it('maps secure login failures without exposing account details', () => {
    const copy = getLoginCopy('ar');
    const error = new PlgApiError(401, {
      code: 'INVALID_CREDENTIALS',
      correlationId: 'corr-login-1',
      messageKey: 'auth.invalidCredentials',
    });
    expect(loginErrorView(error, copy)).toEqual({
      correlationId: 'corr-login-1',
      message: copy.errorInvalid,
    });
  });

  it('remembers only the selected identifier and never the password', () => {
    writeRememberedLogin({ identifier: 'owner@plg.test', identifierType: 'EMAIL' });
    expect(readRememberedLogin()).toEqual({
      identifier: 'owner@plg.test',
      identifierType: 'EMAIL',
    });
    expect(window.localStorage.getItem('plg:remembered-login:v1')).not.toContain('password');
    writeRememberedLogin(null);
    expect(readRememberedLogin()).toBeNull();
  });

  it('sends the generated login endpoint exactly once without duplicating the API prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          expiresAt: '2026-08-30T00:00:00.000Z',
          mfaSetupRequired: false,
          passwordChangeRequired: false,
        }),
        { headers: { 'content-type': 'application/json' }, status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();
    const { authControllerLoginV1 } = await import('@/api/generated/identity/identity');
    await authControllerLoginV1(
      {
        identifier: 'owner@plg.test',
        identifierType: 'EMAIL',
        organizationCode: 'PLG_MAIN',
        password: 'strong-password',
      },
      { allowUnauthorized: true },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/login');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
      method: 'POST',
    });
  });
});
