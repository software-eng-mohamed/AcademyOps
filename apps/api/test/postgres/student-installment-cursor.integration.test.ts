import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { afterAll, expect, it } from 'vitest';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from '../../src/finance/finance-access.service';
import { FinanceInstallmentReadService } from '../../src/finance/finance-installment-read.service';
import { createTestHarness } from './harness';
import { setupStudentSelfServiceFixture } from './student-self-service-fixture';

const harness = createTestHarness();

harness.databaseDescribe('Student installment cursor validation', () => {
  afterAll(async () => {
    await harness.prisma.$disconnect();
  });

  it('rejects a valid UUID that is not a cursor in the current approved schedule', () =>
    harness.inRollbackTransaction(async (transaction) => {
      const fx = await setupStudentSelfServiceFixture(transaction);
      const access: AccessContext = {
        organizationId: fx.orgA.id,
        actorUserId: fx.studentAUser.id,
        grants: new Map([['finance.balance.read', new Set(['S'])]]),
        branchIds: new Set(),
        assignedResourceIds: new Set(),
        studentPersonId: fx.personA.id,
      };
      const service = new FinanceInstallmentReadService(fx.adapter, new FinanceAccessService());

      await expect(
        service.listInstallments(access, fx.enrollmentA.id, {
          limit: 1,
          cursor: randomUUID(),
        }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: {
          code: 'INSTALLMENT_CURSOR_INVALID',
          messageKey: 'finance.installmentCursorInvalid',
        },
      });
    }));
});
