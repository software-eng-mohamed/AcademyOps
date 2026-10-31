import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { money } from './dashboard-utils';

export type ApprovalItem = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  amount?: string;
  currencyCode?: string;
  submittedAt: string;
  version?: number;
};

@Injectable()
export class DashboardApprovalsService {
  constructor(private readonly prisma: PrismaService) {}

  async getApprovals(
    organization: AccessContext,
    enrollmentIds: string[],
    paymentIds: string[],
  ): Promise<ApprovalItem[]> {
    const [pricing, cancellations, refunds, reversals, retakes] = await Promise.all([
      enrollmentIds.length
        ? this.prisma.$queryRaw<
            Array<{
              id: string;
              totalAmount: Prisma.Decimal;
              currencyCode: string;
              updatedAt: Date;
            }>
          >(Prisma.sql`
            SELECT id, total_amount AS "totalAmount", currency_code AS "currencyCode",
              updated_at AS "updatedAt"
            FROM pricing_agreements
            WHERE organization_id = ${organization.organizationId}::uuid
              AND enrollment_id = ANY(${enrollmentIds}::uuid[])
              AND status = 'PROPOSED'
            ORDER BY updated_at ASC
            LIMIT 20
          `)
        : Promise.resolve([]),
      enrollmentIds.length
        ? this.prisma.$queryRaw<Array<{ id: string; enrollmentId: string; createdAt: Date }>>(
            Prisma.sql`
              SELECT id, enrollment_id AS "enrollmentId", created_at AS "createdAt"
              FROM enrollment_cancellation_requests
              WHERE organization_id = ${organization.organizationId}::uuid
                AND enrollment_id = ANY(${enrollmentIds}::uuid[])
                AND status = 'REQUESTED'
              ORDER BY created_at ASC
              LIMIT 20
            `,
          )
        : Promise.resolve([]),
      paymentIds.length
        ? this.prisma.$queryRaw<
            Array<{
              id: string;
              paymentId: string;
              requestedAmount: Prisma.Decimal;
              createdAt: Date;
            }>
          >(Prisma.sql`
            SELECT id, payment_id AS "paymentId", requested_amount AS "requestedAmount",
              created_at AS "createdAt"
            FROM refund_requests
            WHERE organization_id = ${organization.organizationId}::uuid
              AND payment_id = ANY(${paymentIds}::uuid[])
              AND status = 'REQUESTED'
            ORDER BY created_at ASC
            LIMIT 20
          `)
        : Promise.resolve([]),
      paymentIds.length
        ? this.prisma.$queryRaw<Array<{ id: string; paymentId: string; createdAt: Date }>>(
            Prisma.sql`
              SELECT id, payment_id AS "paymentId", created_at AS "createdAt"
              FROM payment_reversal_requests
              WHERE organization_id = ${organization.organizationId}::uuid
                AND payment_id = ANY(${paymentIds}::uuid[])
                AND status = 'REQUESTED'
              ORDER BY created_at ASC
              LIMIT 20
            `,
          )
        : Promise.resolve([]),
      enrollmentIds.length
        ? this.prisma.$queryRaw<
            Array<{ id: string; enrollmentId: string; createdAt: Date; version: number }>
          >(
            Prisma.sql`
              SELECT id, enrollment_id AS "enrollmentId", created_at AS "createdAt", version
              FROM module_retakes
              WHERE organization_id = ${organization.organizationId}::uuid
                AND enrollment_id = ANY(${enrollmentIds}::uuid[])
                AND status = 'REQUESTED'
              ORDER BY created_at ASC
              LIMIT 20
            `,
          )
        : Promise.resolve([]),
    ]);

    const items: ApprovalItem[] = [
      ...pricing.map((item) => ({
        id: item.id,
        type: 'PRICING',
        entityType: 'PricingAgreement',
        entityId: item.id,
        amount: money(item.totalAmount),
        currencyCode: item.currencyCode,
        submittedAt: item.updatedAt.toISOString(),
      })),
      ...cancellations.map((item) => ({
        id: item.id,
        type: 'ENROLLMENT_CANCELLATION',
        entityType: 'Enrollment',
        entityId: item.enrollmentId,
        submittedAt: item.createdAt.toISOString(),
      })),
      ...refunds.map((item) => ({
        id: item.id,
        type: 'REFUND',
        entityType: 'Payment',
        entityId: item.paymentId,
        amount: money(item.requestedAmount),
        currencyCode: 'EGP',
        submittedAt: item.createdAt.toISOString(),
      })),
      ...reversals.map((item) => ({
        id: item.id,
        type: 'PAYMENT_REVERSAL',
        entityType: 'Payment',
        entityId: item.paymentId,
        submittedAt: item.createdAt.toISOString(),
      })),
      ...retakes.map((item) => ({
        id: item.id,
        type: 'MODULE_RETAKE',
        entityType: 'Enrollment',
        entityId: item.enrollmentId,
        submittedAt: item.createdAt.toISOString(),
        version: item.version,
      })),
    ];

    return items.sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  }
}
