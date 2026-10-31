import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { resolveDashboardPeriod } from '../common/time/dashboard-period';
import { FinanceAccessService } from './finance-access.service';
import type { ListPaymentsDto } from './finance.dto';
import type { PaymentMethodMixDto } from './finance.dto';
import { PrismaService } from '../platform/database/prisma.service';
import { FinanceReadHelperService } from './finance-read-helper.service';
import { readPaymentApprovals } from './finance-approval-read';
@Injectable()
export class FinancePaymentReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAccess: FinanceAccessService,
    private readonly helper: FinanceReadHelperService,
  ) {}
  private async branchPaymentFilter(
    transaction: Prisma.TransactionClient,
    access: AccessContext,
    branchId?: string,
  ): Promise<Prisma.PaymentWhereInput | undefined> {
    if (!branchId) return undefined;
    const canReadOrganization = access.grants.get('payments.read')?.has('O') ?? false;
    const branch = await transaction.branch.findFirst({
      where: {
        id: canReadOrganization ? branchId : { equals: branchId, in: [...access.branchIds] },
        organizationId: access.organizationId,
      },
      select: { id: true },
    });
    if (!branch) {
      throw new NotFoundException({
        code: 'FINANCE_RESOURCE_NOT_FOUND',
        messageKey: 'finance.resourceNotFound',
      });
    }
    const [enrollments, businesses] = await Promise.all([
      transaction.enrollment.findMany({
        where: { organizationId: access.organizationId, homeBranchId: branch.id },
        select: { id: true },
      }),
      transaction.businessAccount.findMany({
        where: { organizationId: access.organizationId, owningBranchId: branch.id },
        select: { id: true },
      }),
    ]);
    const corporateBilling = businesses.length
      ? await transaction.billingAccount.findMany({
          where: {
            organizationId: access.organizationId,
            businessAccountId: { in: businesses.map(({ id }) => id) },
          },
          select: { id: true },
        })
      : [];
    return {
      OR: [
        { enrollmentId: { in: enrollments.map(({ id }) => id) } },
        {
          enrollmentId: null,
          billingAccountId: { in: corporateBilling.map(({ id }) => id) },
        },
      ],
    };
  }
  async paymentMethods(access: AccessContext) {
    return this.prisma.paymentMethod.findMany({
      where: { organizationId: access.organizationId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }
  async listPayments(access: AccessContext, input: ListPaymentsDto) {
    return this.prisma.$transaction(async (transaction) => {
      const period = input.fromMonth || input.toMonth ? resolveDashboardPeriod(input) : undefined;
      if (input.billingAccountId) {
        await this.financeAccess.assertBillingAccount(
          transaction,
          access,
          'payments.read',
          input.billingAccountId,
          input.enrollmentId,
        );
      } else if (input.enrollmentId) {
        await this.financeAccess.assertEnrollment(
          transaction,
          access,
          'payments.read',
          input.enrollmentId,
        );
      }
      const visibleBillingIds = await this.financeAccess.visibleBillingAccountIds(
        transaction,
        access,
        'payments.read',
      );
      const branchPaymentFilter = await this.branchPaymentFilter(
        transaction,
        access,
        input.branchId,
      );
      const payments = await transaction.payment.findMany({
        where: {
          organizationId: access.organizationId,
          ...(input.billingAccountId ? { billingAccountId: input.billingAccountId } : {}),
          ...(input.enrollmentId ? { enrollmentId: input.enrollmentId } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(period ? { receivedAt: { gte: period.from, lt: period.toExclusive } } : {}),
          ...(visibleBillingIds === undefined
            ? {}
            : { billingAccountId: { in: visibleBillingIds } }),
          ...(branchPaymentFilter ?? {}),
        },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const visible = payments.slice(0, input.limit);
      const [refunds, receipts, methods] = await Promise.all([
        transaction.refund.groupBy({
          by: ['paymentId'],
          where: {
            organizationId: access.organizationId,
            paymentId: { in: visible.map(({ id }) => id) },
          },
          _sum: { amount: true },
        }),
        transaction.internalReceipt.findMany({
          where: {
            organizationId: access.organizationId,
            paymentId: { in: visible.map(({ id }) => id) },
          },
          select: { paymentId: true },
        }),
        transaction.paymentMethod.findMany({
          where: {
            organizationId: access.organizationId,
            id: { in: visible.map(({ methodId }) => methodId) },
          },
          select: { id: true, code: true, name: true },
        }),
      ]);
      const refunded = new Map(
        refunds.map(({ paymentId, _sum }) => [paymentId, _sum.amount ?? new Prisma.Decimal(0)]),
      );
      const methodById = new Map(methods.map((method) => [method.id, method]));
      return {
        items: visible.map((payment) => ({
          ...this.helper.paymentPresentation(
            payment,
            refunded.get(payment.id) ?? new Prisma.Decimal(0),
          ),
          method: methodById.get(payment.methodId) ?? null,
          receiptIssued: receipts.some(({ paymentId }) => paymentId === payment.id),
        })),
        nextCursor: payments.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    });
  }
  async paymentMethodMix(access: AccessContext, input: PaymentMethodMixDto) {
    return this.prisma.$transaction(async (transaction) => {
      const period = resolveDashboardPeriod(input);
      const visibleBillingIds = await this.financeAccess.visibleBillingAccountIds(
        transaction,
        access,
        'payments.read',
      );
      const branchPaymentFilter = await this.branchPaymentFilter(
        transaction,
        access,
        input.branchId,
      );
      const grouped = await transaction.payment.groupBy({
        by: ['methodId'],
        where: {
          organizationId: access.organizationId,
          status: 'POSTED',
          receivedAt: { gte: period.from, lt: period.toExclusive },
          ...(visibleBillingIds === undefined
            ? {}
            : { billingAccountId: { in: visibleBillingIds } }),
          ...(branchPaymentFilter ?? {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
      });
      const groupedMethodIds = grouped.map(({ methodId }) => methodId);
      const methods = await transaction.paymentMethod.findMany({
        where: {
          organizationId: access.organizationId,
          OR: [
            { isActive: true },
            ...(groupedMethodIds.length ? [{ id: { in: groupedMethodIds } }] : []),
          ],
        },
        select: { id: true, code: true, name: true },
      });
      const groupedByMethod = new Map(grouped.map((item) => [item.methodId, item]));
      const totalAmount = grouped.reduce(
        (sum, item) => sum.add(item._sum.amount ?? 0),
        new Prisma.Decimal(0),
      );
      const totalPayments = grouped.reduce((sum, item) => sum + item._count._all, 0);
      const items = methods
        .map((method) => {
          const aggregate = groupedByMethod.get(method.id);
          const amount = aggregate?._sum.amount ?? new Prisma.Decimal(0);
          return {
            method,
            amount: amount.toFixed(2),
            paymentCount: aggregate?._count._all ?? 0,
            percentage: totalAmount.isZero()
              ? 0
              : Number(amount.div(totalAmount).mul(100).toFixed(2)),
          };
        })
        .sort(
          (left, right) =>
            Number(right.amount) - Number(left.amount) ||
            left.method.code.localeCompare(right.method.code),
        );
      return {
        asOf: new Date(),
        range: {
          from: period.from.toISOString(),
          toExclusive: period.toExclusive.toISOString(),
          fromMonth: period.fromMonth,
          toMonth: period.toMonth,
          timeZone: period.timeZone,
        },
        currencyCode: 'EGP' as const,
        totalAmount: totalAmount.toFixed(2),
        totalPayments,
        items,
      };
    });
  }
  async readPayment(access: AccessContext, paymentId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findFirst({
        where: { organizationId: access.organizationId, id: paymentId },
      });
      if (!payment) throw this.helper.notFound('PAYMENT_NOT_FOUND', 'finance.paymentNotFound');
      await this.financeAccess.assertBillingAccount(
        transaction,
        access,
        'payments.read',
        payment.billingAccountId,
        payment.enrollmentId,
      );
      const [events, receipt, refunds, attempts, method, pendingApprovals] = await Promise.all([
        transaction.paymentEvent.findMany({
          where: { organizationId: access.organizationId, paymentId },
          orderBy: { occurredAt: 'asc' },
        }),
        transaction.internalReceipt.findFirst({
          where: { organizationId: access.organizationId, paymentId },
        }),
        transaction.refund.findMany({
          where: { organizationId: access.organizationId, paymentId },
          orderBy: { processedAt: 'asc' },
        }),
        transaction.paymentGatewayAttempt.findMany({
          where: { organizationId: access.organizationId, paymentId },
          orderBy: { createdAt: 'asc' },
        }),
        transaction.paymentMethod.findFirst({
          where: { organizationId: access.organizationId, id: payment.methodId },
          select: { id: true, code: true, name: true },
        }),
        readPaymentApprovals(transaction, access, paymentId),
      ]);
      const refunded = refunds.reduce(
        (sum, refund) => sum.add(refund.amount),
        new Prisma.Decimal(0),
      );
      return {
        ...this.helper.paymentPresentation(payment, refunded),
        method,
        pendingApprovals,
        events,
        receipt: receipt ? this.helper.receiptPresentation(receipt) : null,
        refunds: refunds.map((refund) => ({ ...refund, amount: refund.amount.toFixed(2) })),
        gatewayAttempts: attempts.map((attempt) => ({
          id: attempt.id,
          provider: attempt.provider,
          status: attempt.status,
          amount: attempt.amount.toFixed(2),
          currencyCode: attempt.currencyCode,
          createdAt: attempt.createdAt,
        })),
      };
    });
  }
}
