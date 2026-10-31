import { expect, it } from 'vitest';
import { DEMO_COOKIE } from '@/api/demo/cookie-state';
import { DEMO_EMAIL, DEMO_ORGANIZATION, DEMO_PASSWORD } from '@/api/demo/credentials';
import { handleDemoRequest } from '@/api/demo/router';
import { demoId } from '@/api/demo/shared';

it('removes read notifications from subsequent lists and preserves the empty state after replay', async () => {
  let cookie = '';
  const call = async (path: string, method = 'GET', body?: unknown) => {
    const response = await handleDemoRequest(
      new Request(`https://academyops.demo/api/v1/${path}`, {
        method,
        headers: { cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    const updated = response.headers
      .getSetCookie()
      .find((value) => value.startsWith(`${DEMO_COOKIE}=`));
    if (updated) cookie = updated.split(';')[0] ?? cookie;
    return response;
  };
  await call('auth/login', 'POST', {
    identifier: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    organizationCode: DEMO_ORGANIZATION,
  });
  expect(await (await call('notifications')).json()).toMatchObject({ unreadCount: 2 });
  expect((await call(`notifications/${demoId(3010)}/read`, 'POST')).status).toBe(204);
  expect(await (await call('notifications')).json()).toMatchObject({
    unreadCount: 1,
    items: [{ id: demoId(3011) }],
  });
  expect((await call('notifications/read-all', 'POST')).status).toBe(204);
  const reloaded = await call('notifications');
  expect(await reloaded.json()).toEqual({ items: [], unreadCount: 0, nextCursor: null });
  expect(reloaded.headers.get('set-cookie')).toBeNull();
});
