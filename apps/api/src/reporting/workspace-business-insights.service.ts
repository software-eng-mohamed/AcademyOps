import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext, OverviewCount, StaffOverview } from '@academyops/contracts';
import { EnrollmentQueryService } from '../enrollment/enrollment-query.service';
import { FinanceAccessService } from '../finance/finance-access.service';
import { PrismaService } from '../platform/database/prisma.service';
import { cairoMidnight, cairoParts, money } from './dashboard-utils';
import { overviewDays, visibleIdsSql } from './workspace-insight-utils';

@Injectable()
export class WorkspaceBusinessInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: EnrollmentQueryService,
    private readonly finance: FinanceAccessService,
  ) {}

  async registrations(access: AccessContext): Promise<OverviewCount[]> {
    const ids = await this.enrollments.visibleEnrollmentIds(
      this.prisma,
      access,
      'enrollments.read',
    );
    const rows = await this.prisma.enrollment.groupBy({
      by: ['state'],
      where: {
        organizationId: access.organizationId,
        ...(ids === undefined ? {} : { id: { in: ids } }),
      },
      _count: { _all: true },
    });
    return rows.map((r) => ({ key: r.state, value: r._count._all }));
  }

  async reception(access: AccessContext, now: Date): Promise<StaffOverview> {
    const ids = await this.enrollments.visibleEnrollmentIds(
      this.prisma,
      access,
      'enrollments.read',
    );
    const scope = Prisma.sql`e.organization_id = ${access.organizationId}::uuid
      AND ${visibleIdsSql(Prisma.sql`e.id`, ids)}`;
    const { year, month, day } = cairoParts(now);
    const from = cairoMidnight(year, month, day - 27);
    const [states, trend, recent] = await Promise.all([
      this.prisma.$queryRaw<OverviewCount[]>(Prisma.sql`
        SELECT e.state AS key, COUNT(*)::int AS value FROM enrollments e
        WHERE ${scope} GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<Array<{ date: string; count: number }>>(Prisma.sql`
        SELECT to_char(e.created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count FROM enrollments e
        WHERE ${scope} AND e.created_at >= ${from} AND e.created_at <= ${now}
        GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<
        Array<{ id: string; course: string | null; state: string; createdAt: Date }>
      >(Prisma.sql`
        SELECT e.id, p.name AS course, e.state, e.created_at AS "createdAt"
        FROM enrollments e
        LEFT JOIN program_versions v ON v.organization_id = e.organization_id AND v.id = e.program_version_id
        LEFT JOIN programs p ON p.organization_id = v.organization_id AND p.id = v.program_id
        WHERE ${scope} AND e.created_at <= ${now} ORDER BY e.created_at DESC, e.id DESC LIMIT 6
      `),
    ]);
    const byDate = new Map(trend.map((d) => [d.date, d.count]));
    return {
      kind: 'RECEPTION',
      states,
      days: overviewDays(now, -27, 28).map((date) => ({ date, count: byDate.get(date) ?? 0 })),
      recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  }

  async payments(access: AccessContext, now: Date): Promise<StaffOverview> {
    const ids = await this.finance.visibleBillingAccountIds(this.prisma, access, 'payments.read');
    const scope = Prisma.sql`p.organization_id = ${access.organizationId}::uuid
      AND ${visibleIdsSql(Prisma.sql`p.billing_account_id`, ids)} AND p.currency_code = 'EGP'`;
    const { year, month } = cairoParts(now);
    const from = cairoMidnight(year, month - 5, 1);
    const monthStart = cairoMidnight(year, month, 1);
    const [rows, methods, pending] = await Promise.all([
      this.prisma.$queryRaw<Array<{ month: string; amount: string }>>(Prisma.sql`
        SELECT to_char(p.received_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM') AS month,
          SUM(p.amount)::text AS amount FROM payments p WHERE ${scope}
          AND p.status = 'POSTED' AND p.received_at >= ${from} AND p.received_at <= ${now}
        GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<Array<{ name: string | null; amount: string }>>(Prisma.sql`
        SELECT m.name, SUM(p.amount)::text AS amount FROM payments p
        LEFT JOIN payment_methods m ON m.organization_id = p.organization_id AND m.id = p.method_id
        WHERE ${scope} AND p.status = 'POSTED' AND p.received_at >= ${monthStart}
          AND p.received_at <= ${now}
        GROUP BY m.id, m.name ORDER BY SUM(p.amount) DESC, m.id LIMIT 5`),
      this.prisma.$queryRaw<Array<{ count: number; amount: string }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count, COALESCE(SUM(p.amount), 0)::text AS amount
        FROM payments p WHERE ${scope} AND p.status = 'PENDING_VERIFICATION' AND p.received_at <= ${now}`),
    ]);
    const byMonth = new Map(rows.map((r) => [r.month, money(r.amount)]));
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 6 + index, 1));
      const key = date.toISOString().slice(0, 7);
      return { month: key, amount: byMonth.get(key) ?? '0.00' };
    });
    return {
      kind: 'ACCOUNTS',
      months,
      methods: methods.map((m) => ({ ...m, amount: money(m.amount) })),
      monthPostedAmount: months[5]!.amount,
      pending: { count: pending[0]!.count, amount: money(pending[0]!.amount) },
    };
  }

  async otp(access: AccessContext, now: Date): Promise<StaffOverview> {
    const { year, month, day } = cairoParts(now);
    const from = cairoMidnight(year, month, day - 6);
    const scope = Prisma.sql`organization_id = ${access.organizationId}::uuid
      AND type = 'security.phone_otp_requested' AND occurred_at <= ${now}`;
    // processed_at means dispatched to BullMQ, NOT delivered to WhatsApp.
    // Only aggregate metadata is read; payload, recipients and codes stay private.
    const [rows, summary] = await Promise.all([
      this.prisma.$queryRaw<Array<{ date: string; count: number }>>(Prisma.sql`
        SELECT to_char(occurred_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count FROM outbox_events WHERE ${scope} AND occurred_at >= ${from}
        GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<
        Array<{ pending: number; retrying: number; last: Date | null }>
      >(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE processed_at IS NULL)::int AS pending,
          COUNT(*) FILTER (WHERE processed_at IS NULL AND attempts > 0)::int AS retrying,
          MAX(occurred_at) AS last FROM outbox_events WHERE ${scope}`),
    ]);
    const byDate = new Map(rows.map((r) => [r.date, r.count]));
    return {
      kind: 'OTP_OPERATOR',
      days: overviewDays(now, -6, 7).map((date) => ({ date, count: byDate.get(date) ?? 0 })),
      pendingDispatch: summary[0]!.pending,
      retryingDispatch: summary[0]!.retrying,
      lastRequestAt: summary[0]!.last?.toISOString() ?? null,
    };
  }
}
