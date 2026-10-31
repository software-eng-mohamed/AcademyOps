import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/database/prisma.service';

export type DashboardPayment = {
  id: string;
  amount: Prisma.Decimal;
  receivedAt: Date;
};

export type DashboardSession = {
  id: string;
  cohortId: string;
  roomId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  deliveryMode: string;
  status: string;
  attendanceWindowState: string;
};

@Injectable()
export class DashboardDataService {
  constructor(private readonly prisma: PrismaService) {}

  visiblePayments(
    organizationId: string,
    branchIds: string[] | null,
    from: Date,
    to: Date,
  ): Promise<DashboardPayment[]> {
    if (branchIds?.length === 0) return Promise.resolve([]);
    const branchFilter = this.branchFilter(branchIds, 'enrollment');
    return this.prisma.$queryRaw<DashboardPayment[]>(Prisma.sql`
      SELECT payment.id, payment.amount, payment.received_at AS "receivedAt"
      FROM payments AS payment
      INNER JOIN enrollments AS enrollment
        ON enrollment.organization_id = payment.organization_id
        AND enrollment.id = payment.enrollment_id
      WHERE payment.organization_id = ${organizationId}::uuid
        AND payment.status IN ('POSTED', 'REVERSED')
        AND payment.received_at >= ${from}
        AND payment.received_at < ${to}
        ${branchFilter}
    `);
  }

  visibleSessions(
    organizationId: string,
    branchIds: string[] | null,
    from: Date,
    to: Date,
  ): Promise<DashboardSession[]> {
    if (branchIds?.length === 0) return Promise.resolve([]);
    const branchFilter = this.branchFilter(branchIds, 'cohort');
    return this.prisma.$queryRaw<DashboardSession[]>(Prisma.sql`
      SELECT session.id, session.cohort_id AS "cohortId", session.room_id AS "roomId",
        session.starts_at AS "startsAt", session.ends_at AS "endsAt",
        session.delivery_mode AS "deliveryMode", session.status,
        session.attendance_window_state AS "attendanceWindowState"
      FROM sessions AS session
      INNER JOIN cohorts AS cohort
        ON cohort.organization_id = session.organization_id
        AND cohort.id = session.cohort_id
      WHERE session.organization_id = ${organizationId}::uuid
        AND session.starts_at >= ${from}
        AND session.starts_at < ${to}
        ${branchFilter}
      ORDER BY session.starts_at ASC
    `);
  }

  visibleRefunds(
    organizationId: string,
    paymentIds: string[],
    from: Date,
    to: Date,
  ): Promise<Array<{ paymentId: string; amount: Prisma.Decimal; processedAt: Date }>> {
    if (!paymentIds.length) return Promise.resolve([]);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT payment_id AS "paymentId", amount, processed_at AS "processedAt"
      FROM refunds
      WHERE organization_id = ${organizationId}::uuid
        AND payment_id = ANY(${paymentIds}::uuid[])
        AND processed_at >= ${from}
        AND processed_at < ${to}
    `);
  }

  visibleReversals(
    organizationId: string,
    paymentIds: string[],
    from: Date,
    to: Date,
  ): Promise<Array<{ paymentId: string; occurredAt: Date }>> {
    if (!paymentIds.length) return Promise.resolve([]);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT payment_id AS "paymentId", occurred_at AS "occurredAt"
      FROM payment_events
      WHERE organization_id = ${organizationId}::uuid
        AND payment_id = ANY(${paymentIds}::uuid[])
        AND to_status = 'REVERSED'
        AND occurred_at >= ${from}
        AND occurred_at < ${to}
    `);
  }

  makeupCredits(
    organizationId: string,
    sessionIds: string[],
  ): Promise<Array<{ missedRecordId: string }>> {
    if (!sessionIds.length) return Promise.resolve([]);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT credit.missed_record_id AS "missedRecordId"
      FROM makeup_credits AS credit
      INNER JOIN attendance_records AS attendance
        ON attendance.organization_id = credit.organization_id
        AND attendance.id = credit.missed_record_id
      WHERE credit.organization_id = ${organizationId}::uuid
        AND attendance.session_id = ANY(${sessionIds}::uuid[])
    `);
  }

  private branchFilter(branchIds: string[] | null, scope: 'enrollment' | 'cohort'): Prisma.Sql {
    if (!branchIds) return Prisma.empty;
    return scope === 'enrollment'
      ? Prisma.sql`AND enrollment.home_branch_id = ANY(${branchIds}::uuid[])`
      : Prisma.sql`AND cohort.owning_branch_id = ANY(${branchIds}::uuid[])`;
  }
}
