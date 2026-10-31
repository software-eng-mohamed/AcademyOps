import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AccessContext } from '@academyops/contracts';
import {
  assertBranchDelegation,
  assertGrantDelegation,
} from '../src/iam/administration/iam-delegation-policy';

function access(grants: AccessContext['grants'], branchIds: string[] = []): AccessContext {
  return {
    organizationId: 'org-1',
    actorUserId: 'actor-1',
    grants,
    branchIds: new Set(branchIds),
    assignedResourceIds: new Set(),
  };
}

describe('IAM delegation ceiling', () => {
  it('prevents role administrators from granting permissions they do not hold', () => {
    const actor = access(new Map([['roles.manage', new Set(['O' as const])]]));
    expect(() =>
      assertGrantDelegation(actor, [{ permissionCode: 'users.manage', scope: 'O' }]),
    ).toThrow(ForbiddenException);
  });

  it('prevents scope escalation while allowing exact and organization-level delegation', () => {
    const branchActor = access(new Map([['students.read_basic', new Set(['B' as const])]]));
    expect(() =>
      assertGrantDelegation(branchActor, [{ permissionCode: 'students.read_basic', scope: 'O' }]),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertGrantDelegation(branchActor, [{ permissionCode: 'students.read_basic', scope: 'B' }]),
    ).not.toThrow();

    const owner = access(new Map([['students.read_basic', new Set(['O' as const])]]));
    expect(() =>
      assertGrantDelegation(owner, [{ permissionCode: 'students.read_basic', scope: 'B' }]),
    ).not.toThrow();
  });

  it('limits non-organization user administrators to their own branches', () => {
    const actor = access(new Map([['users.manage', new Set(['B' as const])]]), ['branch-1']);
    expect(() => assertBranchDelegation(actor, ['branch-1'])).not.toThrow();
    expect(() => assertBranchDelegation(actor, ['branch-2'])).toThrow(ForbiddenException);
  });
});
