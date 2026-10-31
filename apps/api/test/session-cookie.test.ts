import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { setSessionCookies } from '../src/iam/auth/session-cookie.helper';

describe('production session cookies', () => {
  it('uses host-only prefixes, Secure, Strict SameSite, and high priority', () => {
    const response = { cookie: vi.fn() };
    const expiresAt = new Date(Date.now() + 60_000);
    setSessionCookies(response as never, new ConfigService({ NODE_ENV: 'production' }), {
      sessionToken: 'session',
      csrfToken: 'csrf',
      expiresAt,
      persistent: true,
    });

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      '__Host-plg_session',
      'session',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        priority: 'high',
        path: '/',
      }),
    );
    expect(response.cookie.mock.calls[0]?.[2]).toHaveProperty('expires', expiresAt);
    expect(response.cookie.mock.calls[1]?.[2]).toHaveProperty('expires', expiresAt);
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      '__Host-plg_csrf',
      'csrf',
      expect.objectContaining({ httpOnly: false, secure: true, sameSite: 'strict', path: '/' }),
    );
  });

  it('uses the same hardened cookies for an HTTPS review origin', () => {
    const response = { cookie: vi.fn() };
    setSessionCookies(
      response as never,
      new ConfigService({ NODE_ENV: 'development', WEB_ORIGIN: 'https://academy.example.com' }),
      { sessionToken: 'session', csrfToken: 'csrf', expiresAt: new Date(), persistent: false },
    );

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      '__Host-plg_session',
      'session',
      expect.objectContaining({ secure: true, sameSite: 'strict', path: '/' }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      '__Host-plg_csrf',
      'csrf',
      expect.objectContaining({ secure: true, sameSite: 'strict', path: '/' }),
    );
    expect(response.cookie.mock.calls[0]?.[2]).not.toHaveProperty('expires');
    expect(response.cookie.mock.calls[1]?.[2]).not.toHaveProperty('expires');
  });
});
