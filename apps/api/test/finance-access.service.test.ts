import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from '../src/finance/finance-access.service';

describe('FinanceAccessService scoped enrollment integrity', () => {
  it('keeps the requested enrollment id when applying a visible-id scope', async () => {
    const service = new FinanceAccessService();
    vi.spyOn(service, 'visibleEnrollmentIds').mockResolvedValue(['enrollment-1', 'enrollment-2']);
    const findFirst = vi.fn().mockResolvedValue({
      id: 'enrollment-2',
      billingAccountId: 'billing-2',
    });
    const transaction = { enrollment: { findFirst } } as unknown as Prisma.TransactionClient;
    const access = {
      organizationId: 'organization-1',
      actorUserId: 'accounts-user-1',
      grants: new Map([['payments.record', new Set(['B'])]]),
      branchIds: new Set(['branch-1']),
      assignedResourceIds: new Set<string>(),
    } as AccessContext;

    await expect(
      service.assertEnrollment(transaction, access, 'payments.record', 'enrollment-2'),
    ).resolves.toMatchObject({ id: 'enrollment-2' });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-1',
        AND: [{ id: 'enrollment-2' }, { id: { in: ['enrollment-1', 'enrollment-2'] } }],
      },
    });
  });
});
