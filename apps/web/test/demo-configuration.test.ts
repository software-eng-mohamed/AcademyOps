// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('original frontend demo routing', () => {
  it('keeps original login and page routes, with no backend rewrites in demo mode', async () => {
    vi.stubEnv('ACADEMYOPS_DEMO_ONLY', 'true');
    const { default: config } = await import('../next.config');
    expect(await config.redirects?.()).toEqual([
      { source: '/', destination: '/en/login', permanent: false },
    ]);
    expect(await config.rewrites?.()).toEqual([]);
  });

  it('routes ordinary API requests to the backend before the demo handler can match', async () => {
    vi.stubEnv('ACADEMYOPS_DEMO_ONLY', 'false');
    vi.stubEnv('API_INTERNAL_URL', 'https://ordinary-api.example/api/v1');
    const { default: config } = await import('../next.config');
    expect(await config.redirects?.()).toEqual([
      { source: '/', destination: '/ar/login', permanent: false },
    ]);
    expect(await config.rewrites?.()).toEqual({
      beforeFiles: [
        { source: '/socket.io', destination: 'https://ordinary-api.example/socket.io' },
        {
          source: '/socket.io/:path*',
          destination: 'https://ordinary-api.example/socket.io/:path*',
        },
        { source: '/api/v1/:path*', destination: 'https://ordinary-api.example/api/v1/:path*' },
      ],
    });
  });
});
