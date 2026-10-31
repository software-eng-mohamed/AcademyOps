import { Injectable } from '@nestjs/common';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from '../finance-access.service';
import { PrismaService } from '../../platform/database/prisma.service';
import { PricingHelperService } from './pricing-helper.service';
import type { ListPricingAgreementsDto } from './pricing.dto';

@Injectable()
export class PricingReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: PricingHelperService,
  ) {}

  async list(access: AccessContext, input: ListPricingAgreementsDto) {
    return this.prisma.$transaction(async (transaction) => {
      if (input.enrollmentId) {
        await this.financeAccess.assertEnrollment(
          transaction,
          access,
          'pricing.read',
          input.enrollmentId,
        );
      }
      const visibleIds = await this.financeAccess.visibleEnrollmentIds(
        transaction,
        access,
        'pricing.read',
      );
      const agreements = await transaction.pricingAgreement.findMany({
        where: {
          organizationId: access.organizationId,
          ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(visibleIds === undefined ? {} : { AND: [{ enrollmentId: { in: visibleIds } }] }),
        },
        orderBy: { id: 'asc' },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const visible = agreements.slice(0, input.limit);
      return {
        items: visible.map((agreement) => this.helper.pricingResult(agreement)),
        nextCursor: agreements.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    });
  }

  async read(access: AccessContext, agreementId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const agreement = await this.helper.findAgreement(
        transaction,
        access.organizationId,
        agreementId,
      );
      await this.financeAccess.assertEnrollment(
        transaction,
        access,
        'pricing.read',
        agreement.enrollmentId,
      );
      const [lines, schedules] = await Promise.all([
        transaction.pricingAgreementLine.findMany({
          where: { organizationId: access.organizationId, pricingAgreementId: agreement.id },
          orderBy: { createdAt: 'asc' },
        }),
        transaction.installmentSchedule.findMany({
          where: { organizationId: access.organizationId, pricingAgreementId: agreement.id },
          orderBy: { version: 'desc' },
        }),
      ]);
      const installments = await transaction.installment.findMany({
        where: {
          organizationId: access.organizationId,
          scheduleId: { in: schedules.map(({ id }) => id) },
        },
        orderBy: [{ scheduleId: 'asc' }, { ordinal: 'asc' }],
      });
      return {
        ...this.helper.pricingResult(agreement),
        enrollmentId: agreement.enrollmentId,
        currencyCode: agreement.currencyCode,
        proposedBy: agreement.proposedBy,
        approvedBy: agreement.approvedBy,
        approvedAt: agreement.approvedAt,
        lines: lines.map((line) => ({
          ...line,
          quantity: line.quantity.toFixed(2),
          unitAmount: line.unitAmount.toFixed(2),
          lineAmount: line.lineAmount.toFixed(2),
        })),
        schedules: schedules.map((schedule) => ({
          ...schedule,
          installments: installments
            .filter(({ scheduleId }) => scheduleId === schedule.id)
            .map((installment) => ({ ...installment, amount: installment.amount.toFixed(2) })),
        })),
      };
    });
  }
}
