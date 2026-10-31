import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AccessContext } from '@academyops/contracts';
import { PrismaService } from '../../platform/database/prisma.service';
import { cairoMidnight, cairoParts } from '../../reporting/dashboard-utils';
import { overviewDays } from '../../reporting/workspace-insight-utils';
import { LeadAccessService } from '../leads/lead-access.service';
import type { SalesFollowUp, SalesOverview } from './sales-dashboard.types';

type OverviewRow = SalesOverview['metrics'] & {
  dueFollowUps: number;
  items: Array<Omit<SalesFollowUp, 'status'>>;
  states: Array<{ key: string; value: number }>;
  days: Array<{ date: string; count: number }>;
  sources: Array<{ source: string | null; count: number }>;
  withoutNextAction: number;
};

@Injectable()
export class SalesDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: LeadAccessService,
  ) {}

  async overview(access: AccessContext): Promise<SalesOverview> {
    const grants = access.grants.get('leads.read');
    if (!grants || !(['O', 'B', 'A'] as const).some((scope) => grants.has(scope))) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        messageKey: 'auth.permissionDenied',
      });
    }
    const now = new Date();
    const { year, month, day } = cairoParts(now);
    const monthStart = cairoMidnight(year, month, 1);
    const todayStart = cairoMidnight(year, month, day);
    const tomorrowStart = cairoMidnight(year, month, day + 1);
    const trendStart = cairoMidnight(year, month, day - 27);
    const scope = this.accessService.scopeSql(access, 'leads.read');

    // One statement gives counts and the bounded queue the same database snapshot.
    // Conversions use their actual event date, never the lead's updated_at date.
    const [row] = await this.prisma.$queryRaw<OverviewRow[]>(Prisma.sql`
      WITH visible_leads AS (
        SELECT lead.id, lead.organization_id, lead.person_id, lead.stage_id,
          lead.state, lead.created_at, lead.next_action_at, lead.source
        FROM leads AS lead
        WHERE lead.organization_id = ${access.organizationId}::uuid AND ${scope}
      ), summary AS (
        SELECT
          COUNT(*) FILTER (WHERE lead.state IN ('NEW', 'OPEN', 'QUALIFIED'))::int AS "openLeads",
          COUNT(*) FILTER (WHERE lead.created_at >= ${monthStart}
            AND lead.created_at <= ${now})::int AS "newLeadsThisMonth",
          COUNT(conversion.id) FILTER (WHERE conversion.converted_at >= ${monthStart}
            AND conversion.converted_at <= ${now})::int AS "convertedLeadsThisMonth",
          COUNT(*) FILTER (WHERE lead.state IN ('NEW', 'OPEN', 'QUALIFIED')
            AND lead.next_action_at >= ${todayStart}
            AND lead.next_action_at < ${tomorrowStart})::int AS "followUpsToday",
          COUNT(*) FILTER (WHERE lead.state IN ('NEW', 'OPEN', 'QUALIFIED')
            AND lead.next_action_at < ${now})::int AS "overdueFollowUps",
          COUNT(*) FILTER (WHERE lead.state IN ('NEW', 'OPEN', 'QUALIFIED')
            AND lead.next_action_at < ${tomorrowStart})::int AS "dueFollowUps"
          ,COUNT(*) FILTER (WHERE lead.state IN ('NEW', 'OPEN', 'QUALIFIED')
            AND lead.next_action_at IS NULL)::int AS "withoutNextAction"
        FROM visible_leads AS lead
        LEFT JOIN lead_conversions AS conversion
          ON conversion.organization_id = lead.organization_id AND conversion.lead_id = lead.id
      ), due_leads AS (
        SELECT * FROM visible_leads
        WHERE state IN ('NEW', 'OPEN', 'QUALIFIED') AND next_action_at < ${tomorrowStart}
        ORDER BY next_action_at ASC, id ASC
        LIMIT 6
      )
      SELECT summary.*, COALESCE((
        SELECT json_agg(item ORDER BY item."nextActionAt", item.id)
        FROM (
          SELECT lead.id, person.name, stage.name AS "stageName",
            lead.next_action_at AS "nextActionAt"
          FROM due_leads AS lead
          LEFT JOIN persons AS person
            ON person.organization_id = lead.organization_id AND person.id = lead.person_id
          LEFT JOIN lead_stages AS stage
            ON stage.organization_id = lead.organization_id AND stage.id = lead.stage_id
        ) AS item
      ), '[]'::json) AS items,
      COALESCE((SELECT json_agg(r ORDER BY r.key) FROM (
        SELECT state AS key, COUNT(*)::int AS value FROM visible_leads GROUP BY state
      ) r), '[]'::json) AS states,
      COALESCE((SELECT json_agg(r ORDER BY r.date) FROM (
        SELECT to_char(created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS count FROM visible_leads
        WHERE created_at >= ${trendStart} AND created_at <= ${now} GROUP BY 1
      ) r), '[]'::json) AS days,
      COALESCE((SELECT json_agg(r ORDER BY r.count DESC, r.source) FROM (
        SELECT source, COUNT(*)::int AS count FROM visible_leads
        WHERE created_at >= ${trendStart} AND created_at <= ${now}
        GROUP BY source ORDER BY count DESC, source LIMIT 5
      ) r), '[]'::json) AS sources
      FROM summary
    `);
    if (!row) throw new Error('Sales overview aggregate returned no row');

    return {
      insights: {
        states: row.states,
        days: overviewDays(now, -27, 28).map((date) => ({
          date,
          count: row.days.find((d) => d.date === date)?.count ?? 0,
        })),
        sources: row.sources,
        withoutNextAction: row.withoutNextAction,
      },
      generatedAt: now.toISOString(),
      timezone: 'Africa/Cairo',
      scope: grants.has('O') || grants.has('B') ? 'ACCESSIBLE' : 'ASSIGNED',
      period: {
        monthStart: monthStart.toISOString(),
        todayStart: todayStart.toISOString(),
        tomorrowStart: tomorrowStart.toISOString(),
      },
      metrics: {
        openLeads: row.openLeads,
        newLeadsThisMonth: row.newLeadsThisMonth,
        convertedLeadsThisMonth: row.convertedLeadsThisMonth,
        followUpsToday: row.followUpsToday,
        overdueFollowUps: row.overdueFollowUps,
      },
      followUps: {
        total: row.dueFollowUps,
        items: row.items.map((item) => ({
          ...item,
          nextActionAt: new Date(item.nextActionAt).toISOString(),
          status: new Date(item.nextActionAt) < now ? 'OVERDUE' : 'TODAY',
        })),
      },
    };
  }
}
