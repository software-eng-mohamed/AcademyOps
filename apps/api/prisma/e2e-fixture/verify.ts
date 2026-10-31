import type { PrismaClient } from '@prisma/client';
import { FIXTURE_ORGANIZATION_CODE, FIXTURE_ROLES, ROLE_CODES } from './constants';
import { findFixtureOrganization } from './safety';

export interface FixtureCounts {
  users: number;
  roles: number;
  enrollments: number;
  sessions: number;
  attendanceRecords: number;
  payments: number;
  ledgerEntries: number;
}

export async function verifyFixture(prisma: PrismaClient): Promise<FixtureCounts> {
  const organization = await findFixtureOrganization(prisma);
  if (!organization) throw new Error(`${FIXTURE_ORGANIZATION_CODE} fixture does not exist.`);
  const organizationId = organization.id;
  const [users, roles, enrollments, sessions, attendanceRecords, payments, ledgerEntries] =
    await Promise.all([
      prisma.user.count({ where: { organizationId } }),
      prisma.role.count({ where: { organizationId } }),
      prisma.enrollment.count({ where: { organizationId } }),
      prisma.session.count({ where: { organizationId } }),
      prisma.attendanceRecord.count({ where: { organizationId } }),
      prisma.payment.count({ where: { organizationId } }),
      prisma.ledgerEntry.count({ where: { organizationId } }),
    ]);
  const counts = {
    users,
    roles,
    enrollments,
    sessions,
    attendanceRecords,
    payments,
    ledgerEntries,
  };
  if (
    users !== FIXTURE_ROLES.length ||
    roles !== new Set(Object.values(ROLE_CODES).filter(Boolean)).size ||
    enrollments < 2 ||
    sessions < 6 ||
    attendanceRecords < 4 ||
    payments < 2 ||
    ledgerEntries < 6
  ) {
    throw new Error(`Synthetic fixture verification failed: ${JSON.stringify(counts)}.`);
  }
  const firstLogin = await prisma.user.findFirstOrThrow({
    where: {
      organizationId,
      personId: (
        await prisma.person.findUniqueOrThrow({
          where: {
            organizationId_publicId: { organizationId, publicId: 'E2E-FIRST_LOGIN' },
          },
        })
      ).id,
    },
  });
  if (!firstLogin.mustChangePassword || firstLogin.onboardingCompletedAt) {
    throw new Error('First-login fixture lost its onboarding guard state.');
  }
  return counts;
}
