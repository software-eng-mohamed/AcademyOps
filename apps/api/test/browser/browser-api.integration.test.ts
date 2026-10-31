import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { chromium } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { runHttpScenario } from '../http/http-test-harness';

const browserDescribe = process.env.PLG_BROWSER_API_TEST === 'true' ? describe : describe.skip;

browserDescribe('Chromium against real Nest API and disposable PostgreSQL', () => {
  it('persists a student, enforces CSRF and grants, and rejects a revoked session', async () => {
    if (!process.env.DATABASE_URL)
      throw new Error('An explicit disposable DATABASE_URL is required');
    const browser = await chromium.launch();
    try {
      await runHttpScenario(
        { permissions: ['students.create', 'students.read_basic'], roleCode: 'OPERATIONS' },
        async ({
          app,
          baseUrl,
          safeHeaders,
          unsafeHeaders,
          prisma,
          organizationId,
          userId,
          branchId,
        }) => {
          // Use the ephemeral API as the same-origin browser document for this boundary test.
          app.get(ConfigService).set('WEB_ORIGIN', baseUrl);
          const context = await browser.newContext();
          try {
            await context.addCookies(
              safeHeaders.cookie.split('; ').map((cookie) => {
                const separator = cookie.indexOf('=');
                const name = cookie.slice(0, separator);
                return {
                  name,
                  value: cookie.slice(separator + 1),
                  url: baseUrl,
                  httpOnly: name.includes('session'),
                  sameSite: 'Lax' as const,
                };
              }),
            );
            const page = await context.newPage();
            await page.goto(`${baseUrl}/api/v1/health/live`);
            const name = `Browser student ${randomUUID()}`;
            const result = await page.evaluate(
              async ({ name, branchId, csrf }) => {
                const create = (headers: Record<string, string>) =>
                  fetch('/api/v1/students', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', ...headers },
                    body: JSON.stringify({ name, branchId }),
                  });
                const missingCsrf = await create({});
                const created = await create({ 'x-csrf-token': csrf });
                const value = (await created.json()) as { id: string };
                const listed = await fetch(`/api/v1/students?search=${encodeURIComponent(name)}`);
                const listedBody = (await listed.json()) as unknown;
                const forbidden = await fetch('/api/v1/payments');
                return {
                  missingCsrf: missingCsrf.status,
                  created: created.status,
                  id: value.id,
                  listed: listedBody,
                  forbidden: forbidden.status,
                };
              },
              { name, branchId, csrf: unsafeHeaders['x-csrf-token']! },
            );
            expect(result.missingCsrf).toBe(403);
            expect(result.created).toBe(201);
            expect(result.forbidden).toBe(403);
            expect(JSON.stringify(result.listed)).toContain(name);
            expect(await prisma.person.count({ where: { organizationId, name } })).toBe(1);
            await prisma.userSession.updateMany({
              where: { organizationId, userId },
              data: { revokedAt: new Date() },
            });
            expect(await page.evaluate(async () => (await fetch('/api/v1/students')).status)).toBe(
              401,
            );
          } finally {
            await context.close();
          }
        },
      );
    } finally {
      await browser.close();
    }
  }, 120_000);
});
