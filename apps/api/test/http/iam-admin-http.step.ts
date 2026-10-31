import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get, patch, post, put } from './finance-http-client';
import { issueHttpSession, type HttpTestContext } from './http-test-harness';
export async function runIamAdminStep(context: HttpTestContext): Promise<void> {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const branchResponse = await post(context, 'branches', {
    code: `HTTP_${suffix}`,
    name: 'HTTP administration branch',
  });
  assert.equal(branchResponse.status, 201, await branchResponse.clone().text());
  const branch = (await branchResponse.json()) as {
    id: string;
    version: number;
  };
  const staleBranch = await patch(
    context,
    `branches/${branch.id}`,
    { name: 'Must not persist' },
    { 'if-match': '99' },
  );
  assert.equal(staleBranch.status, 409);
  assert.equal(
    (
      (await staleBranch.json()) as {
        code: string;
      }
    ).code,
    'VERSION_CONFLICT',
  );
  const updatedBranchResponse = await patch(
    context,
    `branches/${branch.id}`,
    { name: 'HTTP branch updated' },
    { 'if-match': String(branch.version) },
  );
  assert.equal(updatedBranchResponse.status, 200, await updatedBranchResponse.clone().text());
  assert.equal(
    (
      (await updatedBranchResponse.json()) as {
        version: number;
      }
    ).version,
    2,
  );
  await assertContains(get(context, 'branches?limit=100'), branch.id);
  await assertId(get(context, `branches/${branch.id}`), branch.id);
  const roleResponse = await post(context, 'roles', {
    code: `HttpRole_${suffix}`,
    name: 'HTTP administration role',
    grants: [],
  });
  assert.equal(roleResponse.status, 201, await roleResponse.clone().text());
  const role = (await roleResponse.json()) as {
    id: string;
    version: number;
  };
  const updatedRoleResponse = await patch(
    context,
    `roles/${role.id}`,
    { name: 'HTTP role updated' },
    { 'if-match': String(role.version) },
  );
  assert.equal(updatedRoleResponse.status, 200, await updatedRoleResponse.clone().text());
  const grantsResponse = await put(
    context,
    `roles/${role.id}/grants`,
    { grants: [] },
    { 'if-match': '2' },
  );
  assert.equal(grantsResponse.status, 200, await grantsResponse.clone().text());
  assert.equal(
    (
      (await grantsResponse.json()) as {
        version: number;
      }
    ).version,
    3,
  );
  await assertContains(get(context, 'roles?limit=100'), role.id);
  await assertId(get(context, `roles/${role.id}`), role.id);
  const userResponse = await post(context, 'users', {
    name: 'HTTP managed user',
    email: `managed-${suffix}@example.test`,
    temporaryPassword: 'Managed-Initial-Password!27',
    activateNow: true,
    activationReason: 'HTTP production route verification',
    roleIds: [role.id],
    branchIds: [branch.id],
  });
  assert.equal(userResponse.status, 201, await userResponse.clone().text());
  const user = (await userResponse.json()) as {
    id: string;
    status: string;
    version: number;
  };
  assert.equal(user.status, 'ACTIVE');
  await assertContains(get(context, 'users?limit=100'), user.id);
  await assertId(get(context, `users/${user.id}`), user.id);
  const rolesResponse = await put(
    context,
    `users/${user.id}/roles`,
    { ids: [role.id], reason: 'Confirm least-privilege role assignment' },
    { 'if-match': String(user.version) },
  );
  assert.equal(rolesResponse.status, 200, await rolesResponse.clone().text());
  const branchesResponse = await put(
    context,
    `users/${user.id}/branches`,
    { ids: [branch.id], reason: 'Confirm managed branch assignment' },
    { 'if-match': '2' },
  );
  assert.equal(branchesResponse.status, 200, await branchesResponse.clone().text());
  const suspendedResponse = await patch(
    context,
    `users/${user.id}/status`,
    { status: 'SUSPENDED', reason: 'HTTP lifecycle verification completed' },
    { 'if-match': '3' },
  );
  assert.equal(suspendedResponse.status, 200, await suspendedResponse.clone().text());
  assert.equal(
    (
      (await suspendedResponse.json()) as {
        status: string;
      }
    ).status,
    'SUSPENDED',
  );
  await assertTenantAndRoleBoundaries(context);
}
async function assertContains(responsePromise: Promise<Response>, id: string): Promise<void> {
  const response = await responsePromise;
  assert.equal(response.status, 200, await response.clone().text());
  const body = (await response.json()) as {
    items: Array<{
      id: string;
    }>;
  };
  assert.equal(
    body.items.some((item) => item.id === id),
    true,
  );
}
async function assertId(responsePromise: Promise<Response>, id: string): Promise<void> {
  const response = await responsePromise;
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(
    (
      (await response.json()) as {
        id: string;
      }
    ).id,
    id,
  );
}
async function assertTenantAndRoleBoundaries(context: HttpTestContext): Promise<void> {
  const foreign = await context.prisma.organization.create({
    data: { code: `IAM-X-${randomUUID().slice(0, 8)}`, name: 'Foreign' },
  });
  const branch = await context.prisma.branch.create({
    data: {
      organizationId: foreign.id,
      code: 'FOREIGN',
      name: 'Foreign branch',
    },
  });
  const hidden = await get(context, `branches/${branch.id}`);
  assert.equal(hidden.status, 404);
  const person = await context.prisma.person.create({
    data: {
      organizationId: context.organizationId,
      publicId: `NO-GRANT-${randomUUID().slice(0, 12)}`,
      name: 'No grant user',
    },
  });
  const user = await context.prisma.user.create({
    data: { organizationId: context.organizationId, personId: person.id, status: 'ACTIVE' },
  });
  const headers = await issueHttpSession(context, user.id);
  const denied = await fetch(`${context.baseUrl}/api/v1/branches`, {
    headers: headers.safeHeaders,
  });
  assert.equal(denied.status, 403);
  assert.equal(
    (
      (await denied.json()) as {
        code: string;
      }
    ).code,
    'PERMISSION_DENIED',
  );
}
