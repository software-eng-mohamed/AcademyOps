import type { Prisma, PrismaClient } from '@prisma/client';
import { removeArtifacts } from './artifacts';
import { LOAD_PERSON_PREFIX } from './constants';
import { cleanDomainData } from './cleanup-domain';
import { assertCleanIntent, assertDisposableOrganization } from './safety';

async function deleteUserData(
  prisma: Prisma.TransactionClient,
  organizationId: string,
  userIds: string[],
): Promise<void> {
  const where = { organizationId, userId: { in: userIds } };
  await prisma.userNotification.deleteMany({ where });
  await prisma.userRecentEntity.deleteMany({ where });
  await prisma.phoneOtpChallenge.deleteMany({ where });
  await prisma.passwordResetToken.deleteMany({ where });
  await prisma.mfaRecoveryCode.deleteMany({ where });
  await prisma.mfaFactor.deleteMany({ where });
  await prisma.userSession.deleteMany({ where });
  await prisma.userLoginIdentifier.deleteMany({ where });
  await prisma.userRoleAssignment.deleteMany({ where });
}

export async function cleanLoadFixture(prisma: PrismaClient): Promise<void> {
  assertCleanIntent();
  const organization = await assertDisposableOrganization(prisma);
  const people = await prisma.person.findMany({
    where: { organizationId: organization.id, publicId: { startsWith: LOAD_PERSON_PREFIX } },
    select: { id: true },
  });
  const personIds = people.map((person) => person.id);
  const users = await prisma.user.findMany({
    where: { organizationId: organization.id, personId: { in: personIds } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const removed = await prisma.$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SET LOCAL session_replication_role = replica`;
      await cleanDomainData(transaction, organization.id, personIds);
      await deleteUserData(transaction, organization.id, userIds);
      await transaction.user.deleteMany({
        where: { organizationId: organization.id, id: { in: userIds } },
      });
      const staff = await transaction.staffProfile.findMany({
        where: { organizationId: organization.id, personId: { in: personIds } },
        select: { id: true },
      });
      await transaction.staffBranchAssignment.deleteMany({
        where: {
          organizationId: organization.id,
          staffProfileId: { in: staff.map((item) => item.id) },
        },
      });
      await transaction.staffProfile.deleteMany({
        where: { organizationId: organization.id, personId: { in: personIds } },
      });
      await transaction.studentProfile.deleteMany({
        where: { organizationId: organization.id, personId: { in: personIds } },
      });
      await transaction.personContact.deleteMany({
        where: { organizationId: organization.id, personId: { in: personIds } },
      });
      return transaction.person.deleteMany({
        where: { organizationId: organization.id, id: { in: personIds } },
      });
    },
    { maxWait: 10_000, timeout: 180_000 },
  );
  await removeArtifacts();
  console.log(`${removed.count} synthetic load subjects and local session artifacts removed.`);
}
