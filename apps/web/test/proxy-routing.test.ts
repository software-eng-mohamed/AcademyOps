// @vitest-environment node

import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
import { config } from '@/proxy';

describe('locale proxy routing', () => {
  it.each([
    '/api',
    '/api/v1/auth/login',
    '/api/v1/certificates/certificate-id/file',
    '/api/v1/imports/preview',
    '/socket.io',
    '/socket.io/',
    '/socket.io?EIO=4&transport=websocket',
    '/socket.io/nested',
  ])('leaves backend request %s to the external rewrite', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });

  it.each(['/', '/ar/login', '/en/dashboard', '/ar/students', '/apiary', '/socket.io-status'])(
    'preserves locale proxy coverage for UI route %s',
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    },
  );

  it.each([
    '/_next/static/chunks/app.js',
    '/_next/image?url=%2Flogo.svg&w=48&q=75',
    '/favicon.ico',
  ])('continues excluding framework asset %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});
