// @vitest-environment node

import { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';
import { afterEach, expect, it, vi } from 'vitest';
import { DEMO_COOKIE } from '@/api/demo/cookie-state';
import { DEMO_EMAIL, DEMO_ORGANIZATION, DEMO_PASSWORD } from '@/api/demo/credentials';
import { handleDemoRequest } from '@/api/demo/router';

const state = vi.hoisted(() => ({ serializedCookie: '' }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: () => state.serializedCookie }),
}));

import { createServerApiClient } from '@/api/server/client';
import { readCurrentUser } from '@/api/server/current-user';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('keeps the real current-user/server adapter authenticated after Next cookie serialization', async () => {
  vi.stubEnv('ACADEMYOPS_DEMO_ONLY', 'true');
  const network = vi.fn(() => {
    throw new Error('The synthetic server adapter must not use a real API');
  });
  vi.stubGlobal('fetch', network);
  const response = await handleDemoRequest(
    new Request('https://academyops.demo/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        organizationCode: DEMO_ORGANIZATION,
      }),
    }),
  );
  expect(response.status).toBe(201);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${DEMO_COOKIE}=`))
    ?.split(';')[0];
  if (!cookie) throw new Error('Expected the synthetic session cookie');
  const value = cookie.slice(DEMO_COOKIE.length + 1);
  expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  const legacyBase64 = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  for (const stored of [value, legacyBase64]) {
    state.serializedCookie = new RequestCookies(
      new Headers({ cookie: `${DEMO_COOKIE}=${stored}` }),
    ).toString();
    const client = await createServerApiClient();
    const result = await client.GET('/api/v1/auth/me');
    expect(result.response.status).toBe(200);
    expect(result.data?.name).toBe('Demo Owner');
    expect(await readCurrentUser()).toMatchObject({
      name: 'Demo Owner',
      roles: [{ code: 'OWNER' }],
    });
  }
  expect(network).not.toHaveBeenCalled();
});
