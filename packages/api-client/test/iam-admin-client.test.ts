import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlgIamAdminClient } from '../src/iam-admin-client.js';

const orgId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const roleId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const createdAt = '2026-08-11T10:00:00.000Z';
const branch = {
  id: branchId,
  organizationId: orgId,
  code: 'MAIN',
  name: 'Main',
  isActive: true,
  version: 2,
  createdAt,
  updatedAt: createdAt,
};
const grant = { permissionCode: 'users.manage', scope: 'O' } as const;
const role = {
  id: roleId,
  organizationId: orgId,
  code: 'OWNER_STAFF',
  name: 'Owner staff',
  isSystem: false,
  version: 3,
  createdAt,
  updatedAt: createdAt,
};
const roleWithGrants = { ...role, grants: [grant] };
const user = {
  id: userId,
  publicId: 'STAFF-0001',
  name: 'Owner Operator',
  status: 'ACTIVE',
  preferredLocale: 'en',
  mustChangePassword: true,
  version: 4,
  employeeCode: 'EMP-1',
  identifiers: [{ type: 'EMAIL', normalizedValue: 'owner@example.test', verifiedAt: createdAt }],
  roles: [{ id: roleId, code: role.code, name: role.name }],
  branches: [
    {
      id: branchId,
      code: branch.code,
      name: branch.name,
      isActive: true,
    },
  ],
  createdAt,
  updatedAt: createdAt,
};
const client = new PlgIamAdminClient({
  baseUrl: 'http://localhost:3001/api/v1',
  getCsrfToken: () => 'csrf-iam',
});
afterEach(() => vi.unstubAllGlobals());
describe('IAM administration client', () => {
  it('uses the exact cursor/search/status list contracts', async () => {
    const fetchMock = responses([
      { items: [branch], nextCursor: branchId },
      { items: [roleWithGrants], nextCursor: roleId },
      { items: [user], nextCursor: userId },
    ]);
    vi.stubGlobal('fetch', fetchMock);
    await client.listBranches({ search: 'main', cursor: branchId, limit: 10 });
    await client.listRoles({ search: 'owner', cursor: roleId, limit: 20 });
    await client.listUsers({ search: 'operator', status: 'ACTIVE', cursor: userId, limit: 30 });
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      `/branches?search=main&cursor=${branchId}&limit=10`,
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain(`/roles?search=owner&cursor=${roleId}&limit=20`);
    expect(fetchMock.mock.calls[2]?.[0]).toContain(
      `/users?search=operator&status=ACTIVE&cursor=${userId}&limit=30`,
    );
  });
  it('gets and creates branches, roles, and users with validated responses', async () => {
    const fetchMock = responses([branch, branch, roleWithGrants, roleWithGrants, user, user]);
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.getBranch(branchId)).resolves.toEqual(branch);
    await client.createBranch({ code: 'MAIN', name: branch.name });
    await expect(client.getRole(roleId)).resolves.toEqual(roleWithGrants);
    await client.createRole({
      code: role.code,
      name: role.name,
      grants: [grant],
    });
    await expect(client.getUser(userId)).resolves.toEqual(user);
    await client.createUser({
      name: 'Owner Operator',
      email: 'owner@example.test',
      roleIds: [roleId],
      branchIds: [branchId],
    });
    expect(fetchMock.mock.calls.map(([, init]) => (init as RequestInit).method)).toEqual([
      'GET',
      'POST',
      'GET',
      'POST',
      'GET',
      'POST',
    ]);
  });
  it('sends If-Match for every versioned mutation and exact replacement bodies', async () => {
    const grantsResult = { id: roleId, version: 4, grants: [grant] };
    const fetchMock = responses([branch, role, grantsResult, user, user, user]);
    vi.stubGlobal('fetch', fetchMock);
    await client.updateBranch(branchId, { isActive: false }, 2);
    await client.updateRole(roleId, { name: 'Operations owner' }, 3);
    await client.replaceRoleGrants(roleId, [grant], 4);
    await client.updateUserStatus(userId, { status: 'SUSPENDED', reason: 'Access review' }, 5);
    await client.replaceUserRoles(userId, { ids: [roleId], reason: 'Role review' }, 6);
    await client.replaceUserBranches(userId, { ids: [branchId], reason: 'Branch move' }, 7);
    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([, init]) => (init.headers as Record<string, string>)['If-Match'])).toEqual([
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
    expect(calls.map(([, init]) => init.method)).toEqual([
      'PATCH',
      'PATCH',
      'PUT',
      'PATCH',
      'PUT',
      'PUT',
    ]);
    expect(JSON.parse(String(calls[2]?.[1].body))).toEqual({ grants: [grant] });
    expect(JSON.parse(String(calls[5]?.[1].body))).toEqual({
      ids: [branchId],
      reason: 'Branch move',
    });
  });
  it('exposes no destructive delete operation', () => {
    expect(
      Object.getOwnPropertyNames(PlgIamAdminClient.prototype).some((name) => /delete/i.test(name)),
    ).toBe(false);
  });
});
function responses(values: unknown[]) {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(values.shift()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}
