import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { FinanceAccessService } from './finance-access.service';
import type { ListInstallmentsDto } from './finance.dto';
import { PrismaService } from '../platform/database/prisma.service';

function cairoParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month'), day: value('day') };
}

@Injectable()
export class FinanceInstallmentReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
  ) {}

  async listInstallments(access: AccessContext, enrollmentId: string, input: ListInstallmentsDto) {
    return this.prisma.$transaction(async (transaction) => {
      // 1. Enforce S-scope or general visibility
      await this.financeAccess.assertEnrollment(
        transaction,
        access,
        'finance.balance.read',
        enrollmentId,
      );

      // 2. Find the current APPROVED pricing agreement for the enrollment
      const pricingAgreement = await transaction.pricingAgreement.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId,
          status: 'APPROVED',
        },
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
      });

      if (!pricingAgreement) {
        return {
          items: [],
          nextCursor: null,
        };
      }

      // Find the APPROVED schedule for exactly that pricingAgreementId
      const schedule = await transaction.installmentSchedule.findFirst({
        where: {
          organizationId: access.organizationId,
          enrollmentId,
          pricingAgreementId: pricingAgreement.id,
          status: 'APPROVED',
        },
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
      });

      if (!schedule) {
        return {
          items: [],
          nextCursor: null,
        };
      }

      // 3. Currency from the pricing agreement
      const currency = pricingAgreement.currencyCode;

      // 4. Handle cursor query if pagination cursor is provided
      let ordinalCursor: number | undefined;
      if (input.cursor) {
        const cursorInstallment = await transaction.installment.findFirst({
          where: {
            organizationId: access.organizationId,
            id: input.cursor,
            scheduleId: schedule.id,
          },
          select: { ordinal: true },
        });
        if (!cursorInstallment) {
          throw new BadRequestException({
            code: 'INSTALLMENT_CURSOR_INVALID',
            messageKey: 'finance.installmentCursorInvalid',
          });
        }
        ordinalCursor = cursorInstallment.ordinal;
      }

      // 5. Query installments (fetching limit + 1 for nextCursor calculation)
      const limit = input.limit ?? 25;
      const installments = await transaction.installment.findMany({
        where: {
          organizationId: access.organizationId,
          scheduleId: schedule.id,
          ...(ordinalCursor !== undefined ? { ordinal: { gt: ordinalCursor } } : {}),
        },
        orderBy: { ordinal: 'asc' },
        take: limit + 1,
      });

      const page = installments.slice(0, limit);
      const nextCursor = installments.length > limit ? (page[page.length - 1]?.id ?? null) : null;

      // 6. Compute allocations from canonical ledger data (no N+1 queries)
      const debitEntryIds = page.flatMap((inst) => (inst.debitEntryId ? [inst.debitEntryId] : []));
      const allocations = debitEntryIds.length
        ? await transaction.ledgerAllocation.groupBy({
            by: ['debitEntryId'],
            where: {
              organizationId: access.organizationId,
              debitEntryId: { in: debitEntryIds },
            },
            _sum: { amount: true },
          })
        : [];

      const allocatedMap = new Map<string, Prisma.Decimal>(
        allocations.map((a) => [a.debitEntryId, a._sum.amount ?? new Prisma.Decimal(0)]),
      );

      // 7. Get today's UTC midnight equivalent in Cairo time for status checks
      const cairo = cairoParts(new Date());
      const todayUtcMidnight = new Date(Date.UTC(cairo.year, cairo.month - 1, cairo.day));

      const items = page.map((inst) => {
        const allocatedAmount = inst.debitEntryId
          ? (allocatedMap.get(inst.debitEntryId) ?? new Prisma.Decimal(0))
          : new Prisma.Decimal(0);
        const originalAmount = inst.amount;
        const outstandingAmount = Prisma.Decimal.max(0, originalAmount.sub(allocatedAmount));

        // State calculation
        let state: 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'DUE' | 'UPCOMING';
        if (outstandingAmount.lte(0)) {
          state = 'PAID';
        } else {
          // Compare dates
          const instDueDate = new Date(inst.dueDate);
          const instTime = instDueDate.getTime();
          const todayTime = todayUtcMidnight.getTime();

          if (instTime < todayTime) {
            state = 'OVERDUE';
          } else if (instTime === todayTime) {
            state = 'DUE';
          } else if (allocatedAmount.gt(0)) {
            state = 'PARTIALLY_PAID';
          } else {
            state = 'UPCOMING';
          }
        }

        const payable = inst.debitEntryId !== null && outstandingAmount.gt(0);

        return {
          id: inst.id,
          ordinal: inst.ordinal,
          dueDate: inst.dueDate.toISOString().split('T')[0]!,
          originalAmount: originalAmount.toFixed(2),
          allocatedAmount: allocatedAmount.toFixed(2),
          outstandingAmount: outstandingAmount.toFixed(2),
          currency,
          state,
          payable,
        };
      });

      return {
        items,
        nextCursor,
      };
    });
  }
}
