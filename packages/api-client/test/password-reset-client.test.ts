import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgApiClient } from '../src/client.js';

const client = new PlgApiClient({
  baseUrl: 'https://academy.test/api/v1',
  getCsrfToken: () => 'csrf-value',
});

afterEach(() => vi.unstubAllGlobals());

describe('password reset client', () => {
  it('requests a reset with the generic accepted response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(client.requestPasswordReset('student@example.com')).resolves.toEqual({
      accepted: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://academy.test/api/v1/auth/password/reset/request',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          organizationCode: 'PLG',
          locale: 'en',
          identifierType: 'EMAIL',
          identifier: 'student@example.com',
        }),
      }),
    );
  });

  it('requests a reset for a phone identifier', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await client.requestPasswordReset({ identifierType: 'PHONE', identifier: '+201234567890' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://academy.test/api/v1/auth/password/reset/request',
      expect.objectContaining({
        body: JSON.stringify({
          organizationCode: 'PLG',
          locale: 'en',
          identifierType: 'PHONE',
          identifier: '+201234567890',
        }),
      }),
    );
  });

  it('submits the token only in the reset request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await client.completePasswordReset('secret-reset-token', 'StrongPassword#2026');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('secret-reset-token');
    expect(init.body).toBe(
      JSON.stringify({
        organizationCode: 'PLG',
        token: 'secret-reset-token',
        newPassword: 'StrongPassword#2026',
      }),
    );
  });
});
