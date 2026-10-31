import { describe, expect, it } from 'vitest';
import {
  validateIamBranch,
  validateIamBranchesPage,
  validateIamRoleWithGrants,
  validateIamUser,
  validateIamUsersPage,
} from '../src/iam-admin-validators.js';

const orgId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const roleId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const now = '2026-08-11T10:00:00.000Z';
const branch = {
  id: branchId,
  organizationId: orgId,
  code: 'MAIN',
  name: 'Main',
  isActive: true,
  version: 1,
  createdAt: now,
  updatedAt: now,
};
const role = {
  id: roleId,
  organizationId: orgId,
  code: 'OWNER',
  name: 'Owner',
  isSystem: false,
  version: 1,
  createdAt: now,
  updatedAt: now,
  grants: [{ permissionCode: 'users.manage', scope: 'O' }],
};
const user = {
  id: userId,
  publicId: 'STAFF-1',
  name: 'Owner',
  status: 'ACTIVE',
  preferredLocale: 'en',
  mustChangePassword: false,
  version: 1,
  employeeCode: null,
  identifiers: [{ type: 'EMAIL', normalizedValue: 'owner@example.test', verifiedAt: now }],
  roles: [{ id: roleId, code: 'OWNER', name: 'Owner' }],
  branches: [{ id: branchId, code: 'MAIN', name: 'Main', isActive: true }],
  createdAt: now,
  updatedAt: now,
};
describe('IAM administration response validators', () => {
  it('accepts complete backend branch, role, and user contracts', () => {
    expect(validateIamBranch(branch)).toEqual(branch);
    expect(validateIamRoleWithGrants(role)).toEqual(role);
    expect(validateIamUser(user)).toEqual(user);
  });
  it('rejects malformed version, date, and cursor fields', () => {
    expectInvalid(() => validateIamBranch({ ...branch, version: '1' }));
    expectInvalid(() => validateIamBranch({ ...branch, createdAt: '2026-08-11' }));
    expectInvalid(() => validateIamBranchesPage({ items: [branch], nextCursor: 'not-a-uuid' }));
  });
  it('rejects unknown permissions, scopes, and missing role grants', () => {
    expectInvalid(() => validateIamRoleWithGrants({ ...role, grants: undefined }));
    expectInvalid(() =>
      validateIamRoleWithGrants({
        ...role,
        grants: [{ permissionCode: 'unknown.permission', scope: 'O' }],
      }),
    );
    expectInvalid(() =>
      validateIamRoleWithGrants({
        ...role,
        grants: [{ permissionCode: 'users.manage', scope: 'X' }],
      }),
    );
  });
  it('rejects malformed nested identifiers, roles, branches, and pages', () => {
    expectInvalid(() =>
      validateIamUser({ ...user, identifiers: [{ ...user.identifiers[0], verifiedAt: 'today' }] }),
    );
    expectInvalid(() => validateIamUser({ ...user, roles: [{ id: roleId, code: 'OWNER' }] }));
    expectInvalid(() =>
      validateIamUser({ ...user, branches: [{ ...user.branches[0], isActive: undefined }] }),
    );
    expectInvalid(() =>
      validateIamUsersPage({ items: [{ ...user, status: 'DELETED' }], nextCursor: null }),
    );
  });
});
function expectInvalid(work: () => unknown) {
  expect(work).toThrowError(
    expect.objectContaining({
      payload: expect.objectContaining({ code: 'RESPONSE_INVALID' }),
    }),
  );
}
