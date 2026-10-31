import { resolve } from 'node:path';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/database/prisma.service';
import { DashboardService } from '../src/reporting/dashboard.service';

config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = application.get(PrismaService);
    const dashboard = application.get(DashboardService);
    const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'PLG' } });
    const ownerIdentifier = await prisma.userLoginIdentifier.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        type: 'EMAIL',
        normalizedValue: 'owner@plg.local',
        revokedAt: null,
      },
    });
    const branches = await prisma.branch.findMany({
      where: { organizationId: organization.id, isActive: true },
      select: { id: true },
    });
    const grants = new Map<PermissionCode, ReadonlySet<'O' | 'B' | 'A' | 'S'>>([
      ['reports.operations.read', new Set(['O'])],
      ['finance.balance.read', new Set(['O'])],
      ['payments.read', new Set(['O'])],
      ['attendance.read', new Set(['O'])],
      ['imports.preview', new Set(['O'])],
    ]);
    const access: AccessContext = {
      organizationId: organization.id,
      actorUserId: ownerIdentifier.userId,
      grants,
      branchIds: new Set(branches.map(({ id }) => id)),
      assignedResourceIds: new Set(),
      mfaVerifiedAt: new Date().toISOString(),
    };
    const [overview, counts, importBatch] = await Promise.all([
      dashboard.overview(access),
      Promise.all([
        prisma.studentProfile.count({ where: { organizationId: organization.id } }),
        prisma.enrollment.count({ where: { organizationId: organization.id } }),
        prisma.session.count({ where: { organizationId: organization.id } }),
        prisma.payment.count({ where: { organizationId: organization.id } }),
        prisma.attendanceRecord.count({ where: { organizationId: organization.id } }),
        prisma.legacyReference.count({ where: { organizationId: organization.id } }),
      ]),
      prisma.importBatch.findFirst({
        where: { organizationId: organization.id },
        orderBy: { receivedAt: 'desc' },
        select: { id: true, status: true, sourceSha256: true, reconciliation: true },
      }),
    ]);

    process.stdout.write(
      `${JSON.stringify(
        {
          counts: {
            studentProfiles: counts[0],
            enrollments: counts[1],
            sessions: counts[2],
            payments: counts[3],
            attendanceRecords: counts[4],
            legacyReferences: counts[5],
          },
          ownerDashboard: {
            generatedAt: overview.generatedAt,
            branches: overview.branches.length,
            kpis: overview.kpis,
            trendPoints: {
              enrollments: overview.trends.enrollments.length,
              collections: overview.trends.collections.length,
            },
            attentionItems: overview.attention.total,
            todaySessions: overview.todaySessions.length,
            recentActivity: overview.recentActivity.length,
          },
          importBatch,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await application.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
