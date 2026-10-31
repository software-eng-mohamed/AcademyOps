import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../platform/database/prisma.service';
import { money, Severity } from './dashboard-utils';

export type AttentionItem = {
  id: string;
  reasonCode: string;
  severity: Severity;
  entityType: string;
  entityId: string;
  context: Record<string, string | number>;
  occurredAt: string;
};

@Injectable()
export class DashboardAttentionService {
  constructor(private readonly prisma: PrismaService) {}

  async getAttentionItems(
    access: AccessContext,
    enrollmentIds: string[],
    activeEnrollments: Array<{ id: string; studentPersonId: string }>,
    attendance: Map<string, { numerator: number; denominator: number }>,
    todayStart: Date,
  ): Promise<AttentionItem[]> {
    const [installments, evaluations, certificates, importIssues, failedOutbox, failedExports] =
      await Promise.all([
        this.prisma.installment.findMany({
          where: {
            organizationId: access.organizationId,
            dueDate: { lt: todayStart },
            debitEntryId: { not: null },
          },
          orderBy: { dueDate: 'asc' },
          take: 30,
        }),
        enrollmentIds.length
          ? this.prisma.$queryRaw<
              Array<{ id: string; enrollmentId: string; evaluatedAt: Date }>
            >(Prisma.sql`
              SELECT id, enrollment_id AS "enrollmentId", evaluated_at AS "evaluatedAt"
              FROM eligibility_evaluations
              WHERE organization_id = ${access.organizationId}::uuid
                AND enrollment_id = ANY(${enrollmentIds}::uuid[])
                AND financial_hold = TRUE
              ORDER BY evaluated_at DESC
              LIMIT 30
            `)
          : Promise.resolve([]),
        enrollmentIds.length
          ? this.prisma.$queryRaw<Array<{ id: string; serial: string; issuedAt: Date }>>(
              Prisma.sql`
                SELECT id, serial, issued_at AS "issuedAt"
                FROM certificates
                WHERE organization_id = ${access.organizationId}::uuid
                  AND enrollment_id = ANY(${enrollmentIds}::uuid[])
                  AND validity_status = 'ISSUED'
                  AND pdf_status = 'PENDING_UPLOAD'
                ORDER BY issued_at ASC
                LIMIT 30
              `,
            )
          : Promise.resolve([]),
        access.grants.has('imports.preview')
          ? this.prisma.importIssue.findMany({
              where: { organizationId: access.organizationId, status: 'OPEN' },
              orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
              take: 20,
            })
          : Promise.resolve([]),
        this.prisma.outboxEvent.findMany({
          where: { organizationId: access.organizationId, lastError: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.reportExportJob.findMany({
          where: {
            organizationId: access.organizationId,
            requestedBy: access.actorUserId,
            status: 'FAILED',
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    const installmentEntries = await this.prisma.ledgerEntry.findMany({
      where: {
        organizationId: access.organizationId,
        id: {
          in: installments.flatMap(({ debitEntryId }) => (debitEntryId ? [debitEntryId] : [])),
        },
        enrollmentId: { in: enrollmentIds },
      },
      select: { id: true, enrollmentId: true, amount: true },
    });
    const allocations = await this.prisma.ledgerAllocation.groupBy({
      by: ['debitEntryId'],
      where: {
        organizationId: access.organizationId,
        debitEntryId: { in: installmentEntries.map(({ id }) => id) },
      },
      _sum: { amount: true },
    });

    const installmentByDebit = new Map(installments.map((item) => [item.debitEntryId, item]));
    const allocatedByDebit = new Map(
      allocations.map(({ debitEntryId, _sum }) => [
        debitEntryId,
        _sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
    const items: AttentionItem[] = [];

    for (const entry of installmentEntries) {
      const remaining = entry.amount.sub(allocatedByDebit.get(entry.id) ?? 0);
      if (remaining.lte(0)) continue;
      const installment = installmentByDebit.get(entry.id);
      if (!installment) continue;
      const overdueDays = Math.max(
        1,
        Math.floor((todayStart.getTime() - installment.dueDate.getTime()) / 86_400_000),
      );
      items.push({
        id: `overdue:${installment.id}`,
        reasonCode: 'INSTALLMENT_OVERDUE',
        severity: overdueDays >= 7 ? 'CRITICAL' : 'WARNING',
        entityType: 'Enrollment',
        entityId: entry.enrollmentId ?? installment.id,
        context: { overdueDays, amount: money(remaining), currencyCode: 'EGP' },
        occurredAt: installment.dueDate.toISOString(),
      });
    }

    for (const enrollment of activeEnrollments) {
      const value = attendance.get(enrollment.id);
      if (!value?.denominator) continue;
      const ratio = value.numerator / value.denominator;
      if (ratio >= 0.85) continue;
      items.push({
        id: `attendance:${enrollment.id}`,
        reasonCode: ratio < 0.8 ? 'ATTENDANCE_BELOW_MINIMUM' : 'ATTENDANCE_NEAR_THRESHOLD',
        severity: ratio < 0.8 ? 'CRITICAL' : 'WARNING',
        entityType: 'Enrollment',
        entityId: enrollment.id,
        context: { ratio: ratio.toFixed(4), minimumRatio: '0.8000' },
        occurredAt: new Date().toISOString(),
      });
    }

    const seenHolds = new Set<string>();
    for (const evaluation of evaluations) {
      if (seenHolds.has(evaluation.enrollmentId)) continue;
      seenHolds.add(evaluation.enrollmentId);
      items.push({
        id: `hold:${evaluation.id}`,
        reasonCode: 'FINANCIAL_HOLD',
        severity: 'WARNING',
        entityType: 'Enrollment',
        entityId: evaluation.enrollmentId,
        context: {},
        occurredAt: evaluation.evaluatedAt.toISOString(),
      });
    }

    for (const certificate of certificates) {
      items.push({
        id: `certificate:${certificate.id}`,
        reasonCode: 'CERTIFICATE_UPLOAD_PENDING',
        severity: 'WARNING',
        entityType: 'Certificate',
        entityId: certificate.id,
        context: { serial: certificate.serial },
        occurredAt: certificate.issuedAt.toISOString(),
      });
    }

    for (const issue of importIssues) {
      items.push({
        id: `import:${issue.id}`,
        reasonCode: 'IMPORT_ISSUE',
        severity: issue.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
        entityType: 'ImportIssue',
        entityId: issue.id,
        context: { code: issue.code },
        occurredAt: issue.createdAt.toISOString(),
      });
    }

    for (const event of failedOutbox) {
      items.push({
        id: `outbox:${event.id}`,
        reasonCode: 'OUTBOX_FAILED',
        severity: 'CRITICAL',
        entityType: event.aggregateType,
        entityId: event.aggregateId,
        context: { eventType: event.type },
        occurredAt: event.createdAt.toISOString(),
      });
    }

    for (const job of failedExports) {
      items.push({
        id: `export:${job.id}`,
        reasonCode: 'EXPORT_FAILED',
        severity: 'WARNING',
        entityType: 'ReportExportJob',
        entityId: job.id,
        context: { reportType: job.reportType },
        occurredAt: job.createdAt.toISOString(),
      });
    }

    return items.sort((left, right) => {
      const priority = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      return priority[left.severity] - priority[right.severity];
    });
  }
}
