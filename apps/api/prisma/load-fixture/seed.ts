import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { artifactPath, writeArtifacts, type ArtifactSession } from './artifacts';
import { E2E_ORGANIZATION_CODE, LOAD_PERSON_PREFIX, LOAD_ROLES, ROLE_CODES } from './constants';
import { seedDomainData } from './domain';
import { buildPlan } from './plan';
import { assertDisposableOrganization, assertSeedIntent } from './safety';
const chunkSize = 500;
async function chunks<T>(items: T[], operation: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let index = 0; index < items.length; index += chunkSize) {
    await operation(items.slice(index, index + chunkSize));
  }
}
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export async function seedLoadFixture(prisma: PrismaClient): Promise<void> {
  const environment = assertSeedIntent();
  const organization = await assertDisposableOrganization(prisma);
  const existing = await prisma.person.count({
    where: { organizationId: organization.id, publicId: { startsWith: LOAD_PERSON_PREFIX } },
  });
  if (existing)
    throw new Error('Load subjects already exist; verify or run the guarded clean first.');
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: organization.id, code: 'MAIN' } },
  });
  const roles = await prisma.role.findMany({
    where: { organizationId: organization.id, code: { in: Object.values(ROLE_CODES) } },
  });
  if (roles.length !== LOAD_ROLES.length) {
    throw new Error('Run the deterministic E2E seed first so all synthetic roles exist.');
  }
  const roleIds = Object.fromEntries(roles.map((role) => [role.code, role.id])) as Record<
    string,
    string
  >;
  const plan = buildPlan(environment.runnerCount);
  await chunks(plan, (items) =>
    prisma.person.createMany({
      data: items.map((item) => ({
        organizationId: organization.id,
        publicId: item.publicId,
        name: `Synthetic load ${item.role} ${item.roleIndex}`,
      })),
    }),
  );
  const people = await prisma.person.findMany({
    where: { organizationId: organization.id, publicId: { startsWith: LOAD_PERSON_PREFIX } },
    select: { id: true, publicId: true },
  });
  const peopleByPublicId = new Map(people.map((person) => [person.publicId, person.id]));
  await chunks(plan, (items) =>
    prisma.user.createMany({
      data: items.map((item) => ({
        organizationId: organization.id,
        personId: peopleByPublicId.get(item.publicId)!,
        status: 'ACTIVE',
        preferredLocale: 'en',
        onboardingCompletedAt: new Date('2026-01-01T00:00:00Z'),
        mustChangePassword: false,
      })),
    }),
  );
  const users = await prisma.user.findMany({
    where: { organizationId: organization.id, personId: { in: [...peopleByPublicId.values()] } },
    select: { id: true, personId: true },
  });
  const usersByPersonId = new Map(users.map((user) => [user.personId, user.id]));
  const userFor = (publicId: string) => usersByPersonId.get(peopleByPublicId.get(publicId)!)!;
  const students = plan.filter((item) => item.role === 'student');
  const staff = plan.filter((item) => item.role !== 'student');
  await chunks(students, (items) =>
    prisma.studentProfile.createMany({
      data: items.map((item) => ({
        organizationId: organization.id,
        personId: peopleByPublicId.get(item.publicId)!,
        portalStatus: 'ACTIVE',
      })),
    }),
  );
  await chunks(staff, (items) =>
    prisma.staffProfile.createMany({
      data: items.map((item) => ({
        organizationId: organization.id,
        personId: peopleByPublicId.get(item.publicId)!,
        employeeCode: item.publicId,
        isActive: true,
      })),
    }),
  );
  const staffProfiles = await prisma.staffProfile.findMany({
    where: { organizationId: organization.id, employeeCode: { startsWith: LOAD_PERSON_PREFIX } },
    select: { id: true, employeeCode: true },
  });
  const staffByCode = new Map(staffProfiles.map((profile) => [profile.employeeCode!, profile.id]));
  await chunks(staff, (items) =>
    prisma.staffBranchAssignment.createMany({
      data: items.map((item) => ({
        organizationId: organization.id,
        staffProfileId: staffByCode.get(item.publicId)!,
        branchId: branch.id,
      })),
    }),
  );
  await chunks(plan, (items) =>
    prisma.userRoleAssignment.createMany({
      data: items.map((item) => ({
        organizationId: organization.id,
        userId: userFor(item.publicId),
        roleId: roleIds[ROLE_CODES[item.role]]!,
      })),
    }),
  );
  const domain = await seedDomainData(
    prisma,
    organization.id,
    branch.id,
    plan,
    peopleByPublicId,
    usersByPersonId,
  );
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const secureCookies = environment.targetOrigin.startsWith('https://');
  const sessions: Array<
    ArtifactSession & {
      runnerIndex: number;
    }
  > = [];
  const records = plan.map((item) => {
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const cookiePrefix = secureCookies ? '__Host-' : '';
    sessions.push({
      runnerIndex: item.runnerIndex,
      role: item.role,
      syntheticSubjectId: item.syntheticSubjectId,
      ...(item.role === 'student'
        ? { enrollmentId: domain.enrollmentBySubject.get(item.syntheticSubjectId)! }
        : {}),
      expiresAt: expiresAt.toISOString(),
      cookies: {
        [`${cookiePrefix}plg_session`]: sessionToken,
        [`${cookiePrefix}plg_csrf`]: csrfToken,
      },
    });
    return {
      organizationId: organization.id,
      userId: userFor(item.publicId),
      tokenHash: digest(`${sessionToken}:${environment.sessionPepper}`),
      csrfSecretHash: digest(csrfToken),
      mfaVerifiedAt: new Date(),
      idleTimeoutSeconds: 43200,
      expiresAt,
    };
  });
  await chunks(records, (items) => prisma.userSession.createMany({ data: items }));
  await writeArtifacts(
    environment.runnerCount,
    environment.targetOrigin,
    environment.revision,
    domain.attendanceSessionId,
    sessions,
  );
  console.log(
    `${plan.length} ${E2E_ORGANIZATION_CODE} load subjects seeded; artifacts: ${artifactPath(0)}.`,
  );
}
