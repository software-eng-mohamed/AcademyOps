import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AccessContext, WorkspaceOverview } from '@academyops/contracts';
import { FinanceAccessService } from '../finance/finance-access.service';
import { PrismaService } from '../platform/database/prisma.service';

@Injectable()
export class WorkspacePaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
  ) {}

  async read(
    context: AccessContext,
    today: Date,
    tomorrow: Date,
    monthStart: Date,
    now: Date,
  ): Promise<Pick<WorkspaceOverview, 'metrics' | 'queue'>> {
    const ids = await this.access.visibleBillingAccountIds(this.prisma, context, 'payments.read');
    const scope: Prisma.PaymentWhereInput = {
      organizationId: context.organizationId,
      ...(ids === undefined ? {} : { billingAccountId: { in: ids } }),
    };
    const monthWhere: Prisma.PaymentWhereInput = {
      ...scope,
      receivedAt: { gte: monthStart, lte: now },
    };
    const [paymentsToday, paymentsThisMonth, reversedPaymentsThisMonth, total, items] =
      await Promise.all([
        this.prisma.payment.count({
          where: { ...scope, status: 'POSTED', receivedAt: { gte: today, lt: tomorrow, lte: now } },
        }),
        this.prisma.payment.count({ where: { ...monthWhere, status: 'POSTED' } }),
        this.prisma.payment.count({ where: { ...monthWhere, status: 'REVERSED' } }),
        this.prisma.payment.count({ where: monthWhere }),
        this.prisma.payment.findMany({
          where: monthWhere,
          take: 6,
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
          select: { id: true, methodId: true, amount: true, receivedAt: true, status: true },
        }),
      ]);
    const methods = await this.prisma.paymentMethod.findMany({
      where: {
        organizationId: context.organizationId,
        id: { in: items.map((item) => item.methodId) },
      },
      select: { id: true, name: true },
    });
    const names = new Map(methods.map((item) => [item.id, item.name]));
    return {
      metrics: [
        { key: 'paymentsToday', value: paymentsToday },
        { key: 'paymentsThisMonth', value: paymentsThisMonth },
        { key: 'reversedPaymentsThisMonth', value: reversedPaymentsThisMonth },
      ],
      queue: {
        kind: 'PAYMENTS',
        total,
        items: items.map((item) => ({
          id: item.id,
          title: names.get(item.methodId) ?? null,
          subtitle: null,
          at: item.receivedAt.toISOString(),
          status: item.status,
          amount: item.amount.toFixed(2),
        })),
      },
    };
  }
}
