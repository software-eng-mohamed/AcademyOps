import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runHttpScenario } from './http-test-harness';

const databaseDescribe =
  process.env.DATABASE_URL && process.env.REDIS_URL ? describe : describe.skip;

databaseDescribe('HTTP rate-limit response contract', () => {
  it('returns 429, standard limit headers, and Retry-After after the configured limit', async () => {
    const originalPepper = process.env.SESSION_PEPPER;
    process.env.SESSION_PEPPER = randomBytes(48).toString('hex');
    try {
      await runHttpScenario({ permissions: [] }, async ({ baseUrl }) => {
        const body = JSON.stringify({
          identifierType: 'EMAIL',
          identifier: `rate-${randomUUID()}@e2e.invalid`,
          locale: 'en',
          organizationCode: `RATE_${randomUUID().replaceAll('-', '')}`,
        });
        const request = () =>
          fetch(`${baseUrl}/api/v1/auth/password/reset/request`, {
            body,
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          });

        for (let attempt = 1; attempt <= 5; attempt += 1) {
          const response = await request();
          expect(response.status).toBe(202);
          expect(response.headers.get('ratelimit-limit')).toBe('100');
          expect(Number(response.headers.get('ratelimit-remaining'))).toBeGreaterThan(0);
        }

        const limited = await request();
        expect(limited.status).toBe(429);
        expect(limited.headers.get('ratelimit-limit')).toBe('5');
        expect(limited.headers.get('ratelimit-remaining')).toBe('0');
        expect(Number(limited.headers.get('ratelimit-reset'))).toBeGreaterThan(0);
        expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
        await expect(limited.json()).resolves.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
      });
    } finally {
      if (originalPepper === undefined) delete process.env.SESSION_PEPPER;
      else process.env.SESSION_PEPPER = originalPepper;
    }
  }, 130_000);
});
