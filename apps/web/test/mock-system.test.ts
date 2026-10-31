// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { DEMO_COOKIE } from '@/api/demo/cookie-state';
import { DEMO_EMAIL, DEMO_ORGANIZATION, DEMO_PASSWORD } from '@/api/demo/credentials';
import { handleDemoRequest } from '@/api/demo/router';
import { demoId } from '@/api/demo/shared';

async function visitor() {
  let cookie = '';
  const call = async (path: string, method = 'GET', body?: unknown, version?: number) => {
    const response = await handleDemoRequest(
      new Request(`https://demo.example/api/v1/${path}`, {
        method,
        headers: {
          cookie,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(version ? { 'If-Match': String(version) } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    const next = response.headers
      .getSetCookie()
      .find((entry) => entry.startsWith(`${DEMO_COOKIE}=`))
      ?.split(';')[0];
    if (next) cookie = next;
    return response;
  };
  expect(
    (
      await call('auth/login', 'POST', {
        identifier: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        organizationCode: DEMO_ORGANIZATION,
      })
    ).status,
  ).toBe(201);
  return call;
}

describe('original access and import screens using the internal API', () => {
  it('persists a new branch, accepts the existing edit payload, and detects stale updates', async () => {
    const call = await visitor();
    const created = await call('branches', 'POST', { name: 'Alexandria Demo', code: 'ALEX' });
    expect(created.status).toBe(201);
    const branch = await created.json();
    expect(
      (
        await call(
          `branches/${branch.id}`,
          'PATCH',
          { name: 'Alexandria Studio', isActive: false },
          1,
        )
      ).status,
    ).toBe(200);
    expect(await (await call(`branches/${branch.id}`)).json()).toMatchObject({
      name: 'Alexandria Studio',
      isActive: false,
      version: 2,
    });
    expect(
      (await call(`branches/${branch.id}`, 'PATCH', { name: 'Stale update', isActive: true }, 1))
        .status,
    ).toBe(409);
    const other = await visitor();
    expect((await other(`branches/${branch.id}`)).status).toBe(404);
  });

  it('validates access associations and persists a custom role for a sample user', async () => {
    const call = await visitor();
    const role = await (
      await call('roles', 'POST', {
        name: 'Front desk demo',
        code: 'FRONT_DESK',
        grants: [{ permissionCode: 'students.read_basic', scope: 'O' }],
      })
    ).json();
    expect(
      (await call('roles', 'POST', { name: 'Duplicate role', code: 'FRONT_DESK', grants: [] }))
        .status,
    ).toBe(409);
    expect(
      (
        await call('users', 'POST', {
          name: 'Invalid associations',
          email: 'sample@example.invalid',
          roleIds: ['missing'],
          branchIds: [],
        })
      ).status,
    ).toBe(400);
    const userResponse = await call('users', 'POST', {
      name: 'Sample Colleague',
      email: 'colleague@example.invalid',
      roleIds: [role.id],
      branchIds: [demoId(2)],
      preferredLocale: 'en',
    });
    expect(userResponse.status).toBe(201);
    const user = await userResponse.json();
    const detail = await (await call(`users/${user.id}`)).json();
    expect(detail.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'FRONT_DESK' })]),
    );
    expect(detail.identifiers[0].normalizedValue).toBe('colleague@example.invalid');
  });

  it('requires reconciliation before finalizing the seeded synthetic import', async () => {
    const call = await visitor();
    const path = `imports/batches/${demoId(4500)}`;
    expect((await call(`${path}/finalize`, 'POST')).status).toBe(409);
    expect((await call(`${path}/validate`, 'POST')).status).toBe(201);
    expect(await (await call(`${path}/reconcile`, 'POST')).json()).toMatchObject({
      passed: true,
      batchId: demoId(4500),
    });
    expect((await call(`${path}/finalize`, 'POST')).status).toBe(201);
    expect(await (await call(path)).json()).toMatchObject({ status: 'FINALIZED', openIssues: 0 });
    expect(await (await call(`${path}/issues`)).json()).toMatchObject({ items: [] });
    expect((await call(`${path}/validate`, 'POST')).status).toBe(409);
  });
});
