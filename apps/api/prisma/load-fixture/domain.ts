import type { PrismaClient } from '@prisma/client';
import { seedAcademicDomain } from './domain-academic';
import { seedFinanceDomain } from './domain-finance';
import type { PlannedSubject } from './plan';

export interface DomainResult {
  enrollmentBySubject: Map<string, string>;
  attendanceSessionId: string;
}

export async function seedDomainData(
  prisma: PrismaClient,
  organizationId: string,
  branchId: string,
  plan: PlannedSubject[],
  peopleByPublicId: Map<string, string>,
  usersByPersonId: Map<string, string>,
): Promise<DomainResult> {
  const ownerPerson = await prisma.person.findUniqueOrThrow({
    where: { organizationId_publicId: { organizationId, publicId: 'E2E-OWNER' } },
  });
  const owner = await prisma.user.findUniqueOrThrow({
    where: { organizationId_personId: { organizationId, personId: ownerPerson.id } },
  });
  const academic = await seedAcademicDomain(
    prisma,
    organizationId,
    branchId,
    owner.id,
    plan,
    peopleByPublicId,
    usersByPersonId,
  );
  await seedFinanceDomain(prisma, organizationId, owner.id, academic.enrollments);
  return {
    enrollmentBySubject: new Map(
      academic.enrollments.map((item) => [item.subject.syntheticSubjectId, item.enrollmentId]),
    ),
    attendanceSessionId: academic.attendanceSessionId,
  };
}
