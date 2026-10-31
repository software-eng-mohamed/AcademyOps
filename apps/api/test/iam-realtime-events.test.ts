import type { AccessContext } from '@academyops/contracts';
import { describe, expect, it, vi } from 'vitest';
import { IamBranchAdministrationService } from '../src/iam/administration/iam-branch-administration.service';
import { iamRealtimeEvents } from '../src/iam/administration/iam-realtime-events';
import type { AuditService } from '../src/platform/audit/audit.service';
import type { PrismaService } from '../src/platform/database/prisma.service';
import type { OutboxService } from '../src/platform/outbox/outbox.service';
import { realtimePolicyFor } from '../src/realtime/realtime-policy';
describe('IAM realtime events', () => {
  const aggregate = { organizationId: 'org-a', id: 'target-a' };
  const cases = [
    iamRealtimeEvents.userCreated(aggregate, 'ACTIVE'),
    iamRealtimeEvents.userStatusChanged(aggregate, 'SUSPENDED'),
    iamRealtimeEvents.userRolesReplaced(aggregate),
    iamRealtimeEvents.userBranchesReplaced(aggregate),
    iamRealtimeEvents.roleCreated(aggregate),
    iamRealtimeEvents.roleUpdated(aggregate),
    iamRealtimeEvents.roleGrantsReplaced(aggregate),
    iamRealtimeEvents.branchCreated(aggregate),
    iamRealtimeEvents.branchUpdated(aggregate),
  ];
  it('uses the exact allowlisted event names and tenant-scoped aggregates', () => {
    expect(cases.map(({ type }) => type)).toEqual([
      'user.created',
      'user.status_changed',
      'user.roles_replaced',
      'user.branches_replaced',
      'role.created',
      'role.updated',
      'role.grants_replaced',
      'branch.created',
      'branch.updated',
    ]);
    for (const event of cases) {
      expect(event.organizationId).toBe('org-a');
      expect(event.aggregateId).toBe('target-a');
      expect(realtimePolicyFor(event.type)).toEqual({ topics: ['owner'], staff: true });
    }
    expect(realtimePolicyFor('user.activation_requested')).toBeNull();
  });
  it('keeps the outbox payload limited to identifiers and status', () => {
    expect(cases.map(({ payload }) => payload)).toEqual([
      { userId: 'target-a', status: 'ACTIVE' },
      { userId: 'target-a', status: 'SUSPENDED' },
      { userId: 'target-a' },
      { userId: 'target-a' },
      { roleId: 'target-a' },
      { roleId: 'target-a' },
      { roleId: 'target-a' },
      { branchId: 'target-a' },
      { branchId: 'target-a' },
    ]);
    const serialized = JSON.stringify(cases.map(({ payload }) => payload));
    for (const secretField of [
      'email',
      'password',
      'reason',
      'name',
      'grants',
      'branchIds',
      'roleIds',
    ]) {
      expect(serialized).not.toContain(secretField);
    }
  });
  it('writes the audit and outbox event through the same mutation transaction', async () => {
    const branch = {
      id: 'branch-a',
      organizationId: 'org-a',
      code: 'CAI',
      name: 'Cairo',
      isActive: true,
      version: 1,
    };
    const transaction = { branch: { create: vi.fn().mockResolvedValue(branch) } };
    const prisma = {
      branch: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (work: (current: typeof transaction) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PrismaService;
    const auditWrite = vi.fn().mockResolvedValue(undefined);
    const outboxAdd = vi.fn().mockResolvedValue(undefined);
    const audit = { write: auditWrite } as unknown as AuditService;
    const outbox = { add: outboxAdd } as unknown as OutboxService;
    const service = new IamBranchAdministrationService(prisma, audit, outbox);
    const access: AccessContext = {
      organizationId: 'org-a',
      actorUserId: 'owner-a',
      grants: new Map(),
      branchIds: new Set(),
      assignedResourceIds: new Set(),
    };
    await service.createBranch(access, { code: 'cai', name: 'Cairo' }, 'correlation-a');
    expect(auditWrite).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ action: 'branch.create', entityId: 'branch-a' }),
    );
    expect(outboxAdd).toHaveBeenCalledWith(transaction, {
      organizationId: 'org-a',
      aggregateType: 'Branch',
      aggregateId: 'branch-a',
      type: 'branch.created',
      payload: { branchId: 'branch-a' },
    });
  });
});
