import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AccessContext,
  OverviewCount,
  StaffOverview,
  StaffSession,
} from '@academyops/contracts';
import { CatalogAccessService } from '../academic/catalog-access.service';
import { PrismaService } from '../platform/database/prisma.service';
import { cairoMidnight, cairoParts } from './dashboard-utils';
import { overviewDays, visibleIdsSql } from './workspace-insight-utils';

type LearningRole = 'OPERATIONS' | 'ACADEMIC' | 'ATTENDANCE' | 'TRAINER';
type SessionRow = Omit<StaffSession, 'startsAt' | 'endsAt'> & {
  startsAt: Date;
  endsAt: Date | null;
};

@Injectable()
export class WorkspaceLearningInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogAccessService,
  ) {}

  async read(
    access: AccessContext,
    role: LearningRole,
    now: Date,
    visibleSessionIds: string[] | undefined,
  ): Promise<StaffOverview> {
    const { year, month, day } = cairoParts(now);
    const today = cairoMidnight(year, month, day);
    const tomorrow = cairoMidnight(year, month, day + 1);
    const weekEnd = cairoMidnight(year, month, day + 7);
    const sessionScope = Prisma.sql`s.organization_id = ${access.organizationId}::uuid
      AND ${visibleIdsSql(Prisma.sql`s.id`, visibleSessionIds)}`;
    if (role === 'ACADEMIC') return this.academic(access, sessionScope);
    if (role === 'ATTENDANCE') return this.attendance(sessionScope, now, today, tomorrow);
    const week = Prisma.sql`${sessionScope} AND s.starts_at >= ${today}
      AND s.starts_at < ${weekEnd} AND s.status IN ('SCHEDULED', 'COMPLETED')`;
    const [days, deliveryModes] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          date: string;
          scheduled: number;
          completed: number;
          sessions: number;
          minutes: number;
        }>
      >(Prisma.sql`
        SELECT to_char(s.starts_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS date,
          COUNT(*) FILTER (WHERE s.status = 'SCHEDULED')::int AS scheduled,
          COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int AS completed,
          COUNT(*)::int AS sessions,
          COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 60)), 0)::float AS minutes
        FROM sessions s WHERE ${week} GROUP BY 1 ORDER BY 1
      `),
      this.prisma.$queryRaw<OverviewCount[]>(Prisma.sql`
        SELECT s.delivery_mode AS key, COUNT(*)::int AS value
        FROM sessions s WHERE ${week} GROUP BY 1 ORDER BY 1
      `),
    ]);
    const byDate = new Map(days.map((d) => [d.date, d]));
    const dates = overviewDays(now, 0, 7);
    if (role === 'TRAINER') {
      const select = Prisma.sql`SELECT s.id, COALESCE(c.name, c.code) AS title, r.name AS room,
        s.starts_at AS "startsAt", s.ends_at AS "endsAt",
        s.delivery_mode AS "deliveryMode", s.status
        FROM sessions s
        LEFT JOIN cohorts c ON c.organization_id = s.organization_id AND c.id = s.cohort_id
        LEFT JOIN rooms r ON r.organization_id = s.organization_id AND r.id = s.room_id`;
      const [next, recent] = await Promise.all([
        this.prisma.$queryRaw<SessionRow[]>(Prisma.sql`${select}
          WHERE ${sessionScope} AND s.status = 'SCHEDULED' AND s.starts_at >= ${now}
          ORDER BY s.starts_at, s.id LIMIT 1`),
        this.prisma.$queryRaw<SessionRow[]>(Prisma.sql`${select}
          WHERE ${sessionScope} AND s.status = 'COMPLETED' AND s.starts_at <= ${now}
          ORDER BY s.starts_at DESC, s.id DESC LIMIT 4`),
      ]);
      const serialize = (s: SessionRow): StaffSession => ({
        ...s,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt?.toISOString() ?? null,
      });
      return {
        kind: role,
        days: dates.map((date) => ({
          date,
          sessions: byDate.get(date)?.sessions ?? 0,
          minutes: byDate.get(date)?.minutes ?? 0,
        })),
        deliveryModes,
        nextSession: next[0] ? serialize(next[0]) : null,
        recentSessions: recent.map(serialize),
      };
    }
    const [preparation] = await this.prisma.$queryRaw<
      Array<{ missingRoom: number; missingTrainer: number }>
    >(Prisma.sql`
      SELECT COUNT(*) FILTER (WHERE s.room_id IS NULL AND s.delivery_mode <> 'ONLINE')::int AS "missingRoom",
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM session_trainers t WHERE t.organization_id = s.organization_id
          AND t.session_id = s.id AND t.booking_status = 'CONFIRMED'
        ))::int AS "missingTrainer"
      FROM sessions s WHERE ${sessionScope} AND s.status = 'SCHEDULED'
        AND s.starts_at >= ${now} AND s.starts_at < ${weekEnd}
    `);
    return {
      kind: role,
      days: dates.map((date) => ({
        date,
        scheduled: byDate.get(date)?.scheduled ?? 0,
        completed: byDate.get(date)?.completed ?? 0,
      })),
      deliveryModes,
      registrations: [],
      preparation: preparation!,
    };
  }

  private async academic(access: AccessContext, sessionScope: Prisma.Sql): Promise<StaffOverview> {
    const cohortIds = await this.catalog.visibleCohortIds(access);
    const cohortScope = Prisma.sql`c.organization_id = ${access.organizationId}::uuid
      AND ${visibleIdsSql(Prisma.sql`c.id`, cohortIds)}`;
    const [sessionStates, totals, items] = await Promise.all([
      this.prisma.$queryRaw<OverviewCount[]>(Prisma.sql`
        SELECT s.status AS key, COUNT(*)::int AS value FROM sessions s
        WHERE ${sessionScope} GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS total FROM cohorts c WHERE ${cohortScope}`),
      this.prisma.$queryRaw<
        Extract<StaffOverview, { kind: 'ACADEMIC' }>['cohorts']['items']
      >(Prisma.sql`
        WITH selected AS (
          SELECT c.id, c.name, c.code, c.status, c.created_at FROM cohorts c WHERE ${cohortScope}
          ORDER BY CASE c.status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,
            c.created_at DESC, c.id LIMIT 6
        ) SELECT c.id, COALESCE(c.name, c.code) AS name, c.status,
          COUNT(s.id) FILTER (WHERE s.status = 'SCHEDULED')::int AS scheduled,
          COUNT(s.id) FILTER (WHERE s.status = 'COMPLETED')::int AS completed,
          COUNT(s.id) FILTER (WHERE s.status = 'DRAFT')::int AS draft,
          COUNT(s.id) FILTER (WHERE s.status = 'CANCELLED')::int AS cancelled
        FROM selected c LEFT JOIN sessions s ON s.cohort_id = c.id AND ${sessionScope}
        GROUP BY c.id, c.name, c.code, c.status, c.created_at
        ORDER BY CASE c.status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,
          c.created_at DESC, c.id
      `),
    ]);
    return { kind: 'ACADEMIC', sessionStates, cohorts: { total: totals[0]!.total, items } };
  }

  private async attendance(
    scope: Prisma.Sql,
    now: Date,
    today: Date,
    tomorrow: Date,
  ): Promise<StaffOverview> {
    const { year, month, day } = cairoParts(now);
    const from = cairoMidnight(year, month, day - 6);
    const [rows, windows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ date: string; key: string; value: number }>>(Prisma.sql`
        SELECT to_char(s.starts_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS date,
          a.current_status AS key, COUNT(*)::int AS value
        FROM sessions s JOIN attendance_records a
          ON a.organization_id = s.organization_id AND a.session_id = s.id
        WHERE ${scope} AND s.starts_at >= ${from} AND s.starts_at <= ${now}
          AND s.status IN ('SCHEDULED', 'COMPLETED')
        GROUP BY 1, 2 ORDER BY 1, 2
      `),
      this.prisma.$queryRaw<OverviewCount[]>(Prisma.sql`
        SELECT s.attendance_window_state AS key, COUNT(*)::int AS value FROM sessions s
        WHERE ${scope} AND s.starts_at >= ${today} AND s.starts_at < ${tomorrow}
          AND s.status IN ('SCHEDULED', 'COMPLETED') GROUP BY 1 ORDER BY 1
      `),
    ]);
    const dates = overviewDays(now, -6, 7);
    const counts = new Map(rows.map((r) => [`${r.date}:${r.key}`, r.value]));
    return {
      kind: 'ATTENDANCE',
      windows,
      recordsToday: rows
        .filter((r) => r.date === dates[6])
        .map(({ key, value }) => ({ key, value })),
      days: dates.map((date) => ({
        date,
        present: counts.get(`${date}:PRESENT`) ?? 0,
        late: counts.get(`${date}:LATE`) ?? 0,
        absent: counts.get(`${date}:ABSENT`) ?? 0,
        excused: counts.get(`${date}:EXCUSED`) ?? 0,
        unmarked: counts.get(`${date}:UNMARKED`) ?? 0,
      })),
    };
  }
}
