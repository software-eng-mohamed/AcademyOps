// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, PATCH, POST, PUT } from '@/app/api/v1/[...path]/route';

afterEach(() => vi.unstubAllEnvs());

describe('mock API deployment gate', () => {
  it.each([GET, POST, PUT, PATCH, DELETE])(
    'does not expose mock data without the explicit flag',
    async (handle) => {
      vi.stubEnv('ACADEMYOPS_DEMO_ONLY', 'false');
      const response = await handle(
        new Request('https://academy.example/api/v1/dashboard/overview'),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'NOT_FOUND', messageKey: 'errors.notFound' });
    },
  );

  it('uses the original authentication boundary when the mock is enabled', async () => {
    vi.stubEnv('ACADEMYOPS_DEMO_ONLY', 'true');
    const response = await GET(new Request('https://academy.example/api/v1/dashboard/overview'));
    expect(response.status).toBe(401);
  });
});
