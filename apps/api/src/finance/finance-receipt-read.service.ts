import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from './finance-access.service';
import type { ListReceiptsDto } from './finance.dto';
import { PrismaService } from '../platform/database/prisma.service';
import { FinanceReadHelperService } from './finance-read-helper.service';

@Injectable()
export class FinanceReceiptReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceReadHelperService,
  ) {}

  async listReceipts(access: AccessContext, input: ListReceiptsDto) {
    return this.prisma.$transaction(async (transaction) => {
      if (input.billingAccountId) {
        await this.financeAccess.assertBillingAccount(
          transaction,
          access,
          'receipts.read',
          input.billingAccountId,
        );
      }
      const visibleBillingIds = await this.financeAccess.visibleBillingAccountIds(
        transaction,
        access,
        'receipts.read',
      );
      const receipts = await transaction.internalReceipt.findMany({
        where: {
          organizationId: access.organizationId,
          ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
          ...(visibleBillingIds === undefined
            ? {}
            : { billingAccountId: { in: visibleBillingIds } }),
        },
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const visible = receipts.slice(0, input.limit);
      return {
        items: visible.map((receipt) => this.helper.receiptPresentation(receipt)),
        nextCursor: receipts.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    });
  }

  async readReceipt(access: AccessContext, receiptId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const receipt = await transaction.internalReceipt.findFirst({
        where: { organizationId: access.organizationId, id: receiptId },
      });
      if (!receipt) throw this.helper.notFound('RECEIPT_NOT_FOUND', 'finance.receiptNotFound');
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'receipts.read',
        receipt.billingAccountId,
      );
      return this.helper.receiptPresentation(receipt);
    });
  }
}
