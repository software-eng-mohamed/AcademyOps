import { resolve } from 'node:path';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { AccessContext, PermissionCode } from '@academyops/contracts';
import { permissions } from '@academyops/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/platform/database/prisma.service';
import { StudentsService } from '../src/students/students.service';

config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = application.get(PrismaService);
    const students = application.get(StudentsService);
    const organization = await prisma.organization.findUniqueOrThrow({ where: { code: 'PLG' } });
    const owner = await prisma.userLoginIdentifier.findFirstOrThrow({
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
    const reference = await prisma.legacyReference.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        entityType: 'ENROLLMENT',
        sourceField: 'MASTER_ROW',
      },
      select: { entityId: true },
    });
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: { organizationId: organization.id, id: reference.entityId },
      select: { studentPersonId: true },
    });
    const grants = new Map(
      permissions.map((permission) => [permission, new Set(['O' as const])]),
    ) as Map<PermissionCode, ReadonlySet<'O' | 'B' | 'A' | 'S'>>;
    const access: AccessContext = {
      organizationId: organization.id,
      actorUserId: owner.userId,
      grants,
      branchIds: new Set(branches.map(({ id }) => id)),
      assignedResourceIds: new Set(),
      mfaVerifiedAt: new Date().toISOString(),
    };
    const detail = await students.read(access, enrollment.studentPersonId);
    const item = detail.enrollments[0];
    const list = await students.list(access, { search: detail.publicId, limit: 5 });
    process.stdout.write(
      `${JSON.stringify(
        {
          list: {
            found: list.items.length,
            hasEnrollmentSummary: Boolean(list.items[0]?.enrollmentSummary),
          },
          detail: {
            visibleEnrollments: detail.enrollments.length,
            hasProgram: Boolean(item?.program),
            hasCohort: Boolean(item?.cohort),
            hasBranch: Boolean(item?.branch),
            financeFieldReturned: item ? 'finance' in item : false,
            attendanceFieldReturned: item ? 'attendance' in item : false,
            certificateFieldReturned: item ? 'certificate' in item : false,
            hasImportContext: Boolean(item?.source),
          },
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
