import { test, expect } from '../support/test';

test('authenticated unsafe request without CSRF is rejected and session survives', async ({
  page,
}) => {
  await page.goto('/en/dashboard');
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });
    const body: unknown = await response.json();
    return { status: response.status, body };
  });
  expect(result.status).toBe(403);
  expect(result.body).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });

  const me = await page.request.get('/api/v1/auth/me');
  expect(me.status()).toBe(200);
});
