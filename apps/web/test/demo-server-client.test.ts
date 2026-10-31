// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockHandler, cookie } = vi.hoisted(() => ({
  mockHandler: vi.fn(async (_request: Request) => Response.json({ id: 'fictional-owner' })),
  cookie: 'academyops_demo=synthetic-session',
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ toString: () => cookie }) }));
vi.mock('@/api/demo/router', () => ({ handleDemoRequest: mockHandler }));

import { createServerApiClient } from '@/api/server/client';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('server-side demo API boundary', () => {
  it('reads the mock directly with the visitor cookie and never calls an upstream', async () => {
    vi.stubEnv('ACADEMYOPS_DEMO_ONLY', 'true');
    vi.stubEnv('API_INTERNAL_URL', 'https://real-api.example/api/v1');
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const client = await createServerApiClient();
    const result = await client.GET('/api/v1/auth/me');
    expect(result.data?.id).toBe('fictional-owner');
    expect(network).not.toHaveBeenCalled();
    const request = mockHandler.mock.calls[0]?.[0];
    if (!request) throw new Error('The internal API did not receive the request');
    expect(new URL(request.url).pathname).toBe('/api/v1/auth/me');
    expect(request.headers.get('cookie')).toBe(cookie);
  });

  it('keeps the ordinary authenticated upstream transport when demo mode is off', async () => {
    vi.stubEnv('ACADEMYOPS_DEMO_ONLY', 'false');
    vi.stubEnv('API_INTERNAL_URL', 'https://real-api.example/api/v1');
    const network = vi.fn(async () => Response.json({ id: 'ordinary-user' }));
    vi.stubGlobal('fetch', network);
    const client = await createServerApiClient();
    const result = await client.GET('/api/v1/auth/me');
    expect(result.data?.id).toBe('ordinary-user');
    expect(mockHandler).not.toHaveBeenCalled();
    expect((network.mock.calls[0] as unknown as [Request])[0].url).toBe(
      'https://real-api.example/api/v1/auth/me',
    );
  });
});
